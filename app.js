const { streamInit } = require("./src/twitter");
const dotenv = require("dotenv").config();
const { registerUser, login, validateToken } = require("./src/auth");
const {
  sendMessages,
  handleEmailResponse,
  SNSInit,
} = require("./src/messaging");
const { formatPhoneNumber, searchMessageForFilters } = require("./src/utils");
const {
  connectToClient,
  closeClient,
  createNewUser,
  findUser,
  findUserAndUpdate,
  findUsersForFilters,
} = require("./src/mongo");
const { inspect } = require("util");

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
  const SES = new AWS.SES({ apiVersion: "2010-12-01" });
  const SNS = new AWS.SNS();
  let mongoClient;
  var app = express();

  app.set("view engine", "ejs");
  app.set("views", __dirname + "/views");
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.static("public"));

  app.use(function (req, res, next) {
    if (req.get("x-amz-sns-message-type")) {
      req.headers["content-type"] = "application/json"; //IMPORTANT, otherwise content-type is text for topic confirmation reponse, and body is empty
    }
    next();
  });

  // Load body parser to handle POST requests
  app.use(bodyParser.json());

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

  app.post("/validate-token", async function (req, res) {
    console.log("POST-Validate-Token", !!req.body.idToken);
    const idToken = req.body.idToken;
    try {
      const validToken = await validateToken(idToken);
      if (validToken) {
        res.send({
          isValid: true,
        });
        return;
      }
      res.send({
        isValid: false,
      });
    } catch (e) {
      if (e === "Invalid Token.") {
        res.send({
          isValid: false,
        });
      }
    }
  });

  app.post("/login", async function (req, res) {
    console.log("POST-login", req.body.email, !!req.body.password);
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
      if (e.code && e.message === "Incorrect username or password.") {
        res.status(401).end();
        return;
      }
      res.status(500).end();
    }
  });

  app.post("/signup", async function (req, res) {
    console.log(
      "POST-Signup",
      req.body.email,
      req.body.emailEnabled,
      req.body.phone,
      req.body.phoneEnabled,
      req.body.filters
    );
    const email = req.body.email;
    const emailEnabled = req.body.emailEnabled === "on";
    const phone = formatPhoneNumber(req.body.phone);
    const phoneEnabled = req.body.phoneEnabled === "on";
    const password = req.body.password;
    let filters = [];
    try {
      filters = JSON.parse(req.body.filters);
      console.log("filters ", filters);
    } catch (e) {
      console.error("Error parsing filters: ", req.body.filters);
    }
    var item = {
      email,
      phone,
      emailEnabled,
      phoneEnabled,
      filters,
    };
    /*     let loginUser = null;
    try {
      loginUser = await login(email, password);
    } catch (e) {

    }

    if (loginUser) {
      //Not sure if ID token should be stored client side
      res.status(409).end();
      return;
    } */
    let newUser = null;
    try {
      newUser = await registerUser(email, password, phone);
    } catch (e) {
      var returnStatus = 409;
      res.status(returnStatus).end();
      return;
    }

    console.log(newUser);
    if (newUser) {
      try {
        console.log("inserting new user ", item);
        const mongoInsert = await createNewUser(mongoClient, item);
        console.log(mongoInsert);
        res.send({
          // email: newUser,
          email: item.email,
        });
      } catch (err) {
        var returnStatus = 500;

        res.status(returnStatus).end();
        console.log("Mongo API Error: " + err);
      }
    }
  });

  app.post("/account", async function (req, res) {
    console.log("POST-Validate-Token", !!req.body.idToken);
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
          email: userData.email || "",
          emailEnabled: userData.emailEnabled || false,
          phone: userData.phone || "",
          phoneEnabled: userData.phoneEnabled || false,
          filters: userData.filters || [],
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
        console.log("user ", user);
        const userData = await findUserAndUpdate(
          mongoClient,
          { email: validToken.email },
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

  app.get("/email-unsubscribe", async function (req, res) {
    console.log(req.url);
    console.log(req.query);
    const userId = req.query.userId;
    if (!userId) {
      console.error(
        "Could not unsubscribe user, userId not provided ",
        userId,
        req.url
      );
      var returnStatus = 500;

      res.status(returnStatus).end();
      return;
    }
    try {
      const userData = await findUserAndUpdate(
        mongoClient,
        { userId },
        {
          emailEnabled: false,
        }
      );
      if (userData.lastErrorObject.updatedExisting) {
        res.send(`Successfully unsubscribed from email alerts`);
      }
    } catch (err) {
      var returnStatus = 500;

      res.status(returnStatus).end();
      console.log("Mongo API Error: " + err);
    }
  });

  app.get("/test-message", async function (req, res) {
    if (
      (process.env.ENVIRONMENT && process.env.ENVIRONMENT === "DEV") ||
      true
    ) {
      /* const messageFilters = searchMessageForFilters(
        filters,
        "UNION ATLANTIC -- ".toLocaleLowerCase()
      );
      console.log(messageFilters);
      const users = await findUsersForFilters(mongoClient, messageFilters);
      console.log(users);
       */
      // return;

      sendMessages(SNS, mongoClient, "Cat test");
      // const emailStatus = sendEmails(
      //   SES,
      //   ["jnissenbaum18@gmail.com"],
      //   "test email",
      //   "test subject"
      // );
      // const smsStatus = sendSMS(SNS, , );
      res.send({});
    }
  });

  app.post("/aws/sns/handle-bounces", async function (req, res) {
    console.log("SNS Bounce: ", req.body.Message);
    try {
      await handleEmailResponse(SNS, mongoClient, "Bounce", req, res);

      res.status(200).json({
        success: true,
        message: "Successfully received message",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  app.post("/aws/sns/handle-complaints", async function (req, res) {
    console.log("SNS Complaints: ", req.body.Message);
    try {
      handleEmailResponse(SNS, mongoClient, "Complaint", req, res);

      res.status(200).json({
        success: true,
        message: "Successfully received message.",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  var port = process.env.PORT || 3000;

  var server = app.listen(port, async function () {
    try {
      new Promise(async (resolve, reject) => {
        mongoClient = await connectToClient();
        if (process.env.ENVIRONMENT && process.env.ENVIRONMENT === "DEV") {
        } else {
          await SNSInit(SNS);
          await streamInit(mongoClient, SES, SNS);
        }
      });
    } catch (e) {
      console.error(e);
    }
    console.log("Server running at http://127.0.0.1:" + port + "/");
  });
}
