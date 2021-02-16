const AWS = require("aws-sdk");

// Set the region
AWS.config.update({ region: process.env.REGION });
const SES = new AWS.SES({ apiVersion: "2010-12-01" });
const SNS = new AWS.SNS({ apiVersion: "2010-03-31" });

async function sendEmails(emailAddresses, emailBody, emailSubject) {
  var params = {
    Destination: {
      BccAddresses: [...emailAddresses],
      /* required */
      CcAddresses: [],
      ToAddresses: [
        "njcovidtwitterbot@gmail.com",
        /* more items */
      ],
    },
    Message: {
      /* required */
      Body: {
        /* required */
        Text: {
          Charset: "UTF-8",
          Data: emailBody,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: emailSubject,
      },
    },
    Source: "njcovidtwitterbot@gmail.com" /* required */,
    ReplyToAddresses: [
      "njcovidtwitterbot@gmail.com",
      /* more items */
    ],
  };

  // Create the promise and SES service object
  var sendPromise = SES.sendEmail(params).promise();

  // Handle promise's fulfilled/rejected states
  return sendPromise
    .then(function (data) {
      console.log(data.MessageId);
      return data;
    })
    .catch(function (err) {
      console.error("Email send error ", err, err.stack);
    });
}

async function sendSMS(phoneNumber, message) {
  // Create publish parameters
  var params = {
    Message: message /* required */,
    PhoneNumber: phoneNumber,
  };

  // Create promise and SNS service object
  var publishTextPromise = SNS.publish(params).promise();

  // Handle promise's fulfilled/rejected states
  return publishTextPromise
    .then(function (data) {
      console.log("MessageID is " + data.MessageId);
      return data;
    })
    .catch(function (err) {
      console.error("SMS send error ", err, err.stack);
    });
}

function createEmailBody(emailBody) {}

module.exports = {
  sendEmails,
  sendSMS,
};
