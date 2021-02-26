var MongoClient = require("mongodb").MongoClient,
  f = require("util").format,
  fs = require("fs");
const path = require("path");
const uuidv4 = require("uuid/v4");

//Specify the Amazon DocumentDB cert

async function connectToClient() {
  var ca = [
    fs.readFileSync(
      path.resolve(__dirname, "../rds-key/rds-combined-ca-bundle.pem")
    ),
  ];
  return new Promise((resolve, reject) => {
    let clientString = `mongodb://${process.env.DOCUMENTDB_ADMIN_USERNAME}:${process.env.DOCUMENTDB_ADMIN_PASSWORD}@${process.env.DOCUMENTDB_HOST}:27017?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;
    let mongoOptions = {
      sslValidate: true,
      sslCA: ca,
      useNewUrlParser: true,
    };
    if (process.env.ENVIRONMENT && process.env.ENVIRONMENT === "DEV") {
      clientString = `mongodb://${process.env.DOCUMENTDB_ADMIN_USERNAME}:${process.env.DOCUMENTDB_ADMIN_PASSWORD}@localhost:27017?ssl=true`;
      mongoOptions = {
        sslValidate: false,
        useNewUrlParser: true,
      };
    }
    //Create a MongoDB client, open a connection to Amazon DocumentDB as a replica set,
    //  and specify the read preference as secondary preferred
    var client = MongoClient.connect(
      clientString,
      mongoOptions,
      function (err, client) {
        if (err) reject(err);
        resolve(client);
      }
    );
  });
}

async function testInsert(mongoClient) {
  return new Promise((resolve, reject) => {
    //Specify the database to be used
    db = mongoClient.db("covidBot");

    //Specify the collection to be used
    col = db.collection("botUsers");
    //Insert a single document
    col.insertOne({ hello: "Amazon DocumentDB" }, function (err, result) {
      //Find the document that was previously written
      col.findOne({ hello: "Amazon DocumentDB" }, function (err, result) {
        //Print the result to the screen
        console.log(result);
        resolve(result);
      });
    });
  });
}

async function createNewUser(mongoClient, user) {
  if (!user.email) {
    throw new Error("Cannot create user, email undefined ", user);
  }
  return mongoClient
    .db("covidBot")
    .collection("botUsers")
    .findOneAndUpdate(
      {
        email: user.email,
      },
      {
        $setOnInsert: {
          userId: uuidv4(),
          ...user,
        },
      },
      {
        upsert: true,
        returnNewDocument: true,
      }
    )
    .catch((error) => console.error(error));
}
async function findUser(mongoClient, email) {
  if (!email) {
    throw new Error("Cannot find user, email undefined ", email);
  }
  console.log("finduser ", email);
  return mongoClient
    .db("covidBot")
    .collection("botUsers")
    .findOne({
      email,
    })
    .catch((error) => console.error(error));
}

async function findUserAndUpdate(
  mongoClient,
  userSearchParams,
  userUpdateParams
) {
  if (!userUpdateParams || !userSearchParams) {
    throw new Error(
      "Cannot update user, required params are not defined ",
      userSearchParams,
      userUpdateParams
    );
  }
  const { email, userId } = userSearchParams;
  console.log(userSearchParams, userUpdateParams);
  if (!email && !userId) {
    throw new Error(
      "Cannot update user, email and userId are not defined ",
      userSearchParams
    );
  }
  const { phone, emailEnabled, phoneEnabled, filters } = userUpdateParams;
  return mongoClient
    .db("covidBot")
    .collection("botUsers")
    .findOneAndUpdate(
      {
        $or: [
          {
            email,
          },
          {
            userId,
          },
        ],
      },
      {
        $set: {
          phone,
          emailEnabled,
          phoneEnabled,
        },
        $addToSet: {
          filters,
        },
      },
      {
        returnNewDocument: true,
      }
    )
    .catch((error) => console.error(error));
}

async function findUsersForFilters(mongoClient, filters) {
  return mongoClient
    .db("covidBot")
    .collection("botUsers")
    .find({
      filters: { $in: [...filters, "All"] },
    })
    .toArray()
    .catch((error) => console.error(error));
}

async function closeClient(mongoClient) {
  mongoClient.close();
}

module.exports = {
  connectToClient,
  closeClient,
  createNewUser,
  findUser,
  findUserAndUpdate,
  findUsersForFilters,
};
