const AmazonCognitoIdentity = require("amazon-cognito-identity-js");
const CognitoUserPool = AmazonCognitoIdentity.CognitoUserPool;
const AWS = require("aws-sdk");
const request = require("request");
const jwkToPem = require("jwk-to-pem");
const jwt = require("jsonwebtoken");
global.fetch = require("node-fetch");

const poolData = {
  UserPoolId: process.env.COGNITO_POOL_ID,
  ClientId: process.env.COGNITO_APP_CLIENT_ID,
};
const pool_region = "us-east-2";

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

//https://medium.com/@prasadjay/amazon-cognito-user-pools-in-nodejs-as-fast-as-possible-22d586c5c8ec

function registerUser(email, password, phone) {
  if (!email && !password) {
    throw new Error(
      "Cannot register user, email and password were not provided ",
      email
    );
  }
  var attributeList = [];
  attributeList.push(
    new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "email",
      Value: email,
    })
  );
  if (phone) {
    attributeList.push(
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: "phone_number",
        Value: phone,
      })
    );
  }

  return new Promise((resolve, reject) => {
    userPool.signUp(
      email,
      password,
      attributeList,
      null,
      function (err, result) {
        if (err) {
          console.log(err);
          reject(err);
        }
        cognitoUser = result.user;
        console.log("user name is " + cognitoUser.getUsername());
        resolve(result.user);
      }
    );
  });
}

function login(email, password) {
  if (!email && !password) {
    throw new Error(
      "Cannot register user, email and password were not provided ",
      email
    );
  }
  var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: email,
    Password: password,
  });

  var userData = {
    Username: email,
    Pool: userPool,
  };
  var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: function (result) {
        var tokens = {
          idToken: null,
          accessToken: null,
          refreshToken: null,
        };
        //   console.log("access token + " + result.getAccessToken().getJwtToken());
        //   console.log("id token + " + result.getIdToken().getJwtToken());
        //   console.log("refresh token + " + result.getRefreshToken().getToken());
        tokens.idToken = result.getIdToken().getJwtToken();
        tokens.accessToken = result.getAccessToken().getJwtToken();
        tokens.refreshToken = result.getRefreshToken().getToken();
        resolve(tokens);
      },
      onFailure: function (err) {
        console.log("login error: ", err);
        reject(err);
      },
    });
  });
}

function update(username, password) {
  return;
  var attributeList = [];
  attributeList.push(
    new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "custom:scope",
      Value: "some new value",
    })
  );
  attributeList.push(
    new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "name",
      Value: "some new value",
    })
  );

  var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: username,
    Password: password,
  });

  var userData = {
    Username: username,
    Pool: userPool,
  };
  var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.updateAttributes(attributeList, (err, result) => {
    if (err) {
      //handle error
    } else {
      console.log(result);
    }
  });
}

function validateToken(token) {
  return new Promise((resolve, reject) => {
    request(
      {
        url: `https://cognito-idp.${pool_region}.amazonaws.com/${poolData.UserPoolId}/.well-known/jwks.json`,
        json: true,
      },
      function (error, response, body) {
        if (!error && response.statusCode === 200) {
          pems = {};
          var keys = body["keys"];
          for (var i = 0; i < keys.length; i++) {
            //Convert each key to PEM
            var key_id = keys[i].kid;
            var modulus = keys[i].n;
            var exponent = keys[i].e;
            var key_type = keys[i].kty;
            var jwk = { kty: key_type, n: modulus, e: exponent };
            var pem = jwkToPem(jwk);
            pems[key_id] = pem;
          }
          //validate the token
          var decodedJwt = jwt.decode(token, { complete: true });
          if (!decodedJwt) {
            console.log("Not a valid JWT token");
            return;
          }

          var kid = decodedJwt.header.kid;
          var pem = pems[kid];
          if (!pem) {
            console.log("Invalid token");
            return;
          }

          jwt.verify(token, pem, function (err, payload) {
            if (err) {
              console.log("Invalid Token.");
              reject("Invalid Token.");
            } else {
              console.log("Valid Token.");
              console.log(payload);
              resolve(payload);
            }
          });
        } else {
          console.log("Error! Unable to download JWKs");
        }
      }
    );
  });
}
function renew(email, refreshToken) {
  const RefreshToken = new AmazonCognitoIdentity.CognitoRefreshToken({
    RefreshToken: refreshToken,
  });

  const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

  const userData = {
    Username: email,
    Pool: userPool,
  };

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.refreshSession(RefreshToken, (err, session) => {
    if (err) {
      console.log(err);
    } else {
      let retObj = {
        access_token: session.accessToken.jwtToken,
        id_token: session.idToken.jwtToken,
        refresh_token: session.refreshToken.token,
      };
      console.log(retObj);
    }
  });
}
function deleteUser() {
  return;
  var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: username,
    Password: password,
  });

  var userData = {
    Username: username,
    Pool: userPool,
  };
  var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: function (result) {
      cognitoUser.deleteUser((err, result) => {
        if (err) {
          console.log(err);
        } else {
          console.log("Successfully deleted the user.");
          console.log(result);
        }
      });
    },
    onFailure: function (err) {
      console.log(err);
    },
  });
}

function deleteAttributes(username, password) {
  return;
  var attributeList = [];
  attributeList.push("custom:scope");
  attributeList.push("name");

  var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: username,
    Password: password,
  });

  var userData = {
    Username: username,
    Pool: userPool,
  };
  var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.deleteAttributes(attributeList, (err, result) => {
    if (err) {
      //handle error
    } else {
      console.log(result);
    }
  });
}

function changePassword(username, password, newpassword) {
  var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: username,
    Password: password,
  });

  var userData = {
    Username: username,
    Pool: userPool,
  };
  var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: function (result) {
      cognitoUser.changePassword(password, newpassword, (err, result) => {
        if (err) {
          console.log(err);
        } else {
          console.log("Successfully changed password of the user.");
          console.log(result);
        }
      });
    },
    onFailure: function (err) {
      console.log(err);
    },
  });
}

module.exports = {
  registerUser,
  login,
  validateToken,
  renew,
  changePassword,
};
