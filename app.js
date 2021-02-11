const { streamInit } = require("./src/twitter");
const dotenv = require("dotenv").config();
const { registerUser, login, validateToken } = require("./src/auth");
const { sendEmail, sendSMS } = require("./src/messaging");
const { formatPhoneNumber } = require("./src/utils");
const {
  connectToClient,
  closeClient,
  createNewUser,
  findUser,
  findUserAndUpdate,
  findUsersForFilter,
} = require("./src/mongo");

// Include the cluster module
var cluster = require("cluster");

// Code to run if we're in the master process

if (
  cluster.isMaster &&
  !process.env.ENVIRONMENT &&
  !process.env.ENVIRONMENT === "DEV"
) {
  // Count the machine's CPUs
  var cpuCount = require("os").cpus().length;

  // Create a worker for each CPU
  for (var i = 0; i < cpuCount; i += 1) {
    cluster.fork();
  }

  // Listen for terminating workers
  cluster.on("exit", function (worker) {
    // Replace the terminated workers
    console.log("Worker " + worker.id + " died :(");
    cluster.fork();
  });

  // Code to run if we're in a worker process
} else {
  var AWS = require("aws-sdk");
  var express = require("express");
  var bodyParser = require("body-parser");

  AWS.config.region = process.env.REGION;
  let mongoClient;
  var app = express();

  app.set("view engine", "ejs");
  app.set("views", __dirname + "/views");
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.static("public"));

  app.get("/", function (req, res) {
    res.render("index", {
      static_path: "static",
      theme: process.env.THEME || "flatly",
      flask_debug: process.env.FLASK_DEBUG || "false",
    });
  });

  app.get("/config", function (req, res) {
    res.send({
      userPoolId: process.env.COGNITO_POOL_ID,
      clientId: process.env.COGNITO_APP_CLIENT_ID,
      region: process.env.REGION,
      identityPoolId: process.env.COGNITO_IDENTITY_POOL_ID,
    });
  });

  app.post("/login", async function (req, res) {
    console.log(req.body);
    const email = req.body.email;
    const password = req.body.password;
    try {
      const userData = await login(email, password);
      //Not sure if ID token should be stored client side
      console.log("userData ", userData);
      res.send({
        idToken: userData.idToken,
        accessToken: userData.accessToken,
        refreshToken: userData.refreshToken,
        email: userData.email,
      });
    } catch (e) {
      res.status(401).end();
    }
  });

  app.post("/signup", async function (req, res) {
    console.log(req.body, req.body.email);
    const email = req.body.email;
    const emailEnabled = req.body.emailEnabled === "on";
    const phone = formatPhoneNumber(req.body.phone);
    const phoneEnabled = req.body.phoneEnabled === "on";
    const filters = req.body.filters;
    const password = req.body.password;
    var item = {
      email,
      phone,
      emailEnabled,
      phoneEnabled,
      filters,
    };

    const loginUser = await login(email, password);

    if (loginUser) {
      //Not sure if ID token should be stored client side
      console.log("userData ", loginUser);
      res.send({
        idToken: loginUser.idToken,
        accessToken: loginUser.accessToken,
        refreshToken: loginUser.refreshToken,
        email: loginUser.email,
      });
      return;
    }

    const newUser = await registerUser(email, password, phone);

    console.log(newUser);
    if (newUser) {
      try {
        const mongoInsert = await createNewUser(mongoClient, item);
        res.send({
          email: newUser,
        });
      } catch (err) {
        var returnStatus = 500;

        res.status(returnStatus).end();
        console.log("Mongo API Error: " + err);
      }
    }
  });

  app.post("/account", async function (req, res) {
    const idToken = req.body.idToken;
    let validToken;
    try {
      validToken = await validateToken(idToken);
    } catch (e) {
      var returnStatus = 401;
      res.status(returnStatus).end();
      return;
    }

    if (validToken) {
      try {
        const userData = await findUser(mongoClient, validToken.email);
        res.send({
          email: userData.email,
          emailEnabled: userData.emailEnabled,
          phone: userData.phone,
          phoneEnabled: userData.phoneEnabled,
        });
      } catch (err) {
        var returnStatus = 500;

        res.status(returnStatus).end();
        console.log("Mongo API Error: " + err);
      }
    }
  });

  app.post("/account-update", async function (req, res) {
    console.log("account-update", req.body);
    const email = req.body.email;
    const emailEnabled = req.body.emailEnabled === "on";
    const phone = req.body.phone;
    const phoneEnabled = req.body.phoneEnabled === "on";
    const filters = JSON.parse(req.body.filters);
    const user = {
      emailEnabled,
      phone,
      phoneEnabled,
      filters,
    };
    const idToken = req.body.idToken;
    const validToken = await validateToken(idToken);
    console.log("valid token ", !!validToken);
    if (validToken) {
      try {
        const userData = await findUserAndUpdate(
          mongoClient,
          validToken.email,
          user
        );
        console.log("userData ", userData);
        if (userData.lastErrorObject.updatedExisting) {
          res.send({
            success: true,
          });
        }
      } catch (err) {
        var returnStatus = 500;

        res.status(returnStatus).end();
        console.log("Mongo API Error: " + err);
      }
    }
  });

  app.get("/test-message", async function (req, res) {
    if (process.env.ENVIRONMENT && process.env.ENVIRONMENT === "DEV") {
      const users = await findUsersForFilter(mongoClient, "Atlantic");
      console.log(users);
      return;
      const emailStatus = sendEmail(
        ["njcovidtwitterbot@gmail.com"],
        "test email",
        "test subject"
      );
      const smsStatus = sendSMS("+19083800715", "Test Message");
      res.send({
        emailStatus,
        smsStatus,
      });
    }
  });

  var port = process.env.PORT || 3000;

  var server = app.listen(port, async function () {
    try {
      mongoClient = await connectToClient();
      new Promise(async (resolve, reject) => {
        // await streamInit();
      });
    } catch (e) {
      console.error(e);
    }
    console.log("Server running at http://127.0.0.1:" + port + "/");
  });
}
