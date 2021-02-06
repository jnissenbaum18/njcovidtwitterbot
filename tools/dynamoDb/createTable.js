var AWS = require("aws-sdk");

AWS.config.update({
  region: "us-east-2",
  endpoint: "http://localhost:8000",
});

var dynamodb = new AWS.DynamoDB();

var params = {
  TableName: process.env.DYNAMODB_USER_TABLE || "UsersTable",
  KeySchema: [
    { AttributeName: "email", KeyType: "HASH" }, //Partition key
    // { AttributeName: "phone", KeyType: "RANGE" }, //Sort key
  ],
  AttributeDefinitions: [
    { AttributeName: "email", AttributeType: "S" },
    // { AttributeName: "phone", AttributeType: "S" },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

dynamodb.createTable(params, function (err, data) {
  if (err) {
    console.error(
      "Unable to create table. Error JSON:",
      JSON.stringify(err, null, 2)
    );
  } else {
    console.log(
      "Created table. Table description JSON:",
      JSON.stringify(data, null, 2)
    );
  }
});
