var AWS = require("aws-sdk");

AWS.config.update({
  region: "us-east-2",
  endpoint: "http://localhost:8000",
});

var docClient = new AWS.DynamoDB.DocumentClient();

var table = process.env.DYNAMODB_USER_TABLE || "UsersTable";

function putItem() {
  var putParams = {
    TableName: table,
    Item: {
      email: "james@gmail.com",
      phone: "12345",
    },
  };

  console.log("Adding a new item...");
  docClient.put(putParams, function (err, data) {
    if (err) {
      console.error(
        "Unable to add item. Error JSON:",
        JSON.stringify(err, null, 2)
      );
    } else {
      console.log("Added item:", JSON.stringify(data, null, 2));
    }
  });
}

function readItem() {
  var readParams = {
    TableName: table,
    Key: {
      email: "njcovidtwitterbot@gmail.com",
    },
  };

  docClient.get(readParams, function (err, data) {
    if (err) {
      console.error(
        "Unable to read item. Error JSON:",
        JSON.stringify(err, null, 2)
      );
    } else {
      console.log("GetItem succeeded:", JSON.stringify(data, null, 2));
    }
  });
}

function updateItem() {
  var updateParams = {
    TableName: table,
    Key: {
      email: "james@gmail.com",
    },
    UpdateExpression: "set phone = :p, firstname = :n",
    //   UpdateExpression: "set info.rating = :r, info.plot=:p, info.actors=:a",
    ExpressionAttributeValues: {
      ":p": "54321",
      ":n": "james",
    },
    ReturnValues: "UPDATED_NEW",
  };

  console.log("Updating the item...");
  docClient.update(updateParams, function (err, data) {
    if (err) {
      console.error(
        "Unable to update item. Error JSON:",
        JSON.stringify(err, null, 2)
      );
    } else {
      console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
    }
  });
}

// putItem();
readItem();
// updateItem();
