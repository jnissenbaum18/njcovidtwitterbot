const AWS = require("aws-sdk");
const { searchMessageForFilters } = require("./utils");
const { findUsersForFilters, findUserAndUpdate } = require("./mongo");
const sgMail = require("@sendgrid/mail");

// Set the region
AWS.config.update({ region: process.env.REGION });

const topicArnBounce = process.env.SNS_TOPIC_ARN_BOUNCE;
var paramsTopicBounces = {
  Protocol: "https",
  TopicArn: topicArnBounce,
  Endpoint: "https://www.covidvaxalerts.com/aws/sns/handle-bounces",
};

const topicArnComplaint = process.env.SNS_TOPIC_ARN_COMPLAINT;
var paramsTopicComplaints = {
  Protocol: "https",
  TopicArn: topicArnComplaint,
  Endpoint: "https://www.covidvaxalerts.com/aws/sns/handle-bounces",
};

const messageFilters = [
  "Atlantic",
  "Bergen",
  "Burlington",
  "Camden",
  "Cape",
  "Cumberland",
  "Essex",
  "Gloucester",
  "Hudson",
  "Hunterdon",
  "Mercer",
  "Middlesex",
  "Monmouth",
  "Morris",
  "Ocean",
  "Passaic",
  "Salem",
  "Somerset",
  "Sussex",
  "Union",
  "Warren",
  "Bronx",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Staten Island",
  "Cat",
];

async function sendEmailSendGrid(emailAddress, emailBody, emailSubject) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = {
    to: emailAddress, // Change to your recipient
    from: "alerts@covidvaxalerts.com", // Change to your verified sender
    subject: emailSubject,
    text: emailBody,
  };
  sgMail
    .send(msg)
    .then(() => {
      console.log("Email sent");
    })
    .catch((error) => {
      console.error(error);
    });
}

async function sendEmailSES(SES, emailAddress, emailBody, emailSubject) {
  var params = {
    Destination: {
      /* required */
      CcAddresses: ["njcovidtwitterbot@gmail.com"],
      ToAddresses: [
        emailAddress,
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
    Source: "alerts@covidvaxalerts.com" /* required */,
    ReplyToAddresses: [
      "alerts@covidvaxalerts.com",
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

async function sendSMS(SNS, phoneNumber, message) {
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

async function getUsersForMessage(mongoClient, message) {
  const foundFilters = searchMessageForFilters(
    messageFilters,
    message.toLocaleLowerCase()
  );
  console.log("Found filters for message ", foundFilters);
  const users = await findUsersForFilters(mongoClient, foundFilters);
  console.log("Found users for filters ", users.length);
  return users;
}

async function sendMessages(SNS, mongoClient, text) {
  try {
    const users = await getUsersForMessage(mongoClient, text);
    users.forEach((user) => {
      if (user.emailEnabled) {
        sendEmailSendGrid(
          user.email,
          createEmailBody(text, user),
          "COVID Twitter Alert"
        );
        console.log(`Sending email to: ${user.email}`);
      }
      if (user.phoneEnabled) {
        //console.log("Sending message to phone: ", user.phone);
        //sendSMS(SNS, user.phone, text);
      }
    });
  } catch (e) {
    console.error("Send messages error: ", e);
  }
}

function createEmailBody(emailBody, user) {
  return `Covid Alert Message:

    ${emailBody}
  
  Click to unsubscribe from email alerts: ${createUnsubscribeLink(user)}
  `;
}

function createUnsubscribeLink(user) {
  return `https://www.covidvaxalerts.com/email-unsubscribe?userId=${user.userId}`;
}

const handleSnsNotification = async (mongoClient, req, res) => {
  const message = JSON.parse(req.body.Message);
  console.log("SNS message, ", message);
  if (
    (message && message.notificationType == "Bounce") ||
    message.notificationType == "Complaint"
  ) {
    const mail = message.mail;
    if (mail && mail.destination) {
      for (let i = 0; i < mail.destination.length; i++) {
        const address = mail.destination[i];

        try {
          await findUserAndUpdate(
            mongoClient,
            { email: address },
            {
              emailEnabled: false,
              lastMessage: req.body.Message,
            }
          );
        } catch (error) {
          console.error(error.message);
        }
      }
    }
  }
};

const handleEmailResponse = async (
  SNS,
  mongoClient,
  responseType,
  req,
  res
) => {
  let topicArn = null;

  if (responseType === "Bounce") {
    topicArn = topicArnBounce;
  }
  if (responseType === "Complaint") {
    topicArn = topicArnComplaint;
  }

  if (!topicArn) {
    throw new Error(
      "Could not handle incoming message, topicArn is not defined",
      responseType
    );
  }

  console.log("amz-sns-header ", req.headers["x-amz-sns-message-type"]);

  if (
    req.headers["x-amz-sns-message-type"] === "Notification" &&
    req.body.Message
  ) {
    await handleSnsNotification(mongoClient, req, res);
  } else if (
    req.headers["x-amz-sns-message-type"] === "SubscriptionConfirmation"
  ) {
    var params = {
      Token: req.body.Token,
      TopicArn: topicArn,
    };
    console.log("Attempting to subscribe to topic ", params);
    SNS.confirmSubscription(params, function (err, data) {
      if (err) throw err; // an error occurred
      console.error(data);
    });
  }
};

//https://medium.com/@serbanmihai/how-to-handle-aws-ses-bounces-and-complaints-53d6e7455443
async function SNSInit(SNS) {
  SNS.subscribe(paramsTopicBounces, function (error, data) {
    if (error) throw new Error(`Unable to set up SNS subscription: ${error}`);
    console.log(
      `SNS subscription set up successfully: ${JSON.stringify(data)}`
    );
  });

  SNS.subscribe(paramsTopicComplaints, function (error, data) {
    if (error) throw new Error(`Unable to set up SNS subscription: ${error}`);
    console.log(
      `SNS subscription set up successfully: ${JSON.stringify(data)}`
    );
  });
}

module.exports = {
  sendMessages,
  handleEmailResponse,
  SNSInit,
};
