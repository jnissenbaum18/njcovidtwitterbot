const { streamInit } = require("./src/twitter");
const dotenv = require("dotenv").config();
const { registerUser, login, validateToken } = require("./src/auth");
const { formatPhoneNumber } = require("./src/utils");

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

  let ddbConfig = {};

  if (process.env.ENVIRONMENT && process.env.ENVIRONMENT === "DEV") {
    ddbConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
  }
  var sns = new AWS.SNS();
  var ddb = new AWS.DynamoDB(ddbConfig);

  var ddbTable = process.env.DYNAMODB_USER_TABLE;
  var snsTopic = process.env.NEW_SIGNUP_TOPIC;
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
      const cognitoTokens = await login(email, password);
      //Not sure if ID token should be stored client side
      console.log("cognitoTokens ", cognitoTokens);
      res.send({
        idToken: cognitoTokens.idToken,
        accessToken: cognitoTokens.accessToken,
        refreshToken: cognitoTokens.refreshToken,
      });
    } catch (e) {
      res.status(401).end();
    }
  });

  app.post("/signup", async function (req, res) {
    console.log(req.body, req.body.email);
    const email = req.body.email;
    const password = req.body.password;
    const phone = formatPhoneNumber(req.body.phone);
    var item = {
      email: { S: email },
      phone: { S: phone },
    };

    const newUser = await registerUser(email, password, phone);

    console.log(newUser);
    if (newUser) {
      ddb.putItem(
        {
          TableName: ddbTable,
          Item: item,
          Expected: { email: { Exists: false } },
        },
        function (err, data) {
          if (err) {
            var returnStatus = 500;

            if (err.code === "ConditionalCheckFailedException") {
              returnStatus = 409;
            }

            res.status(returnStatus).end();
            console.log("DDB Error: " + err);
          } else {
            sns.publish(
              {
                Message:
                  "Name: " +
                  req.body.name +
                  "\r\nEmail: " +
                  req.body.email +
                  "\r\nPreviewAccess: " +
                  req.body.previewAccess +
                  "\r\nTheme: " +
                  req.body.theme,
                Subject: "New user sign up!!!",
                TopicArn: snsTopic,
              },
              function (err, data) {
                if (err) {
                  res.status(500).end();
                  console.log("SNS Error: " + err);
                } else {
                  res.status(201).end();
                }
              }
            );
          }
        }
      );
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
      ddb.getItem(
        {
          TableName: ddbTable,
          Key: {
            email: { S: validToken.email },
          },
        },
        function (err, data) {
          if (err) {
            var returnStatus = 500;

            res.status(returnStatus).end();
            console.log("DDB Error: " + err);
          } else {
            if (data) {
              console.log("account data ", data);
              res.send({
                email: data.Item.email.S,
                phone: data.Item.phone.S,
              });
            }
          }
        }
      );
    }
  });

  app.post("/account-update", async function (req, res) {
    console.log("account-update", req.body);
    const email = req.body.email;
    const phone = req.body.phone;
    const idToken = req.body.idToken;
    const filters = JSON.parse(req.body.filters);
    console.log(filters);
    console.log("get acct data", ddbTable, req.body);
    const validToken = await validateToken(idToken);
    console.log("valid token ", validToken);
    if (validToken) {
      ddb.updateItem(
        {
          TableName: ddbTable,
          UpdateExpression: "set phone = :p",
          ExpressionAttributeValues: {
            ":p": {
              S: phone,
            },
          },
          ReturnValues: "UPDATED_NEW",
          Key: {
            email: { S: validToken.email },
          },
        },
        function (err, data) {
          if (err) {
            var returnStatus = 500;

            res.status(returnStatus).end();
            console.log("DDB Error: " + err);
          } else {
            if (data) {
              console.log(data);
              res.send({
                success: true,
              });
              //   res.send({
              //     email: data.email.S,
              //     phone: data.phone.S,
              //   });
            }
          }
        }
      );
    }
  });

  var port = process.env.PORT || 3000;

  var server = app.listen(port, function () {
    try {
      new Promise(async (resolve, reject) => {
        // await streamInit();
      });
    } catch (e) {
      console.error(e);
    }
    console.log("Server running at http://127.0.0.1:" + port + "/");
  });
}
