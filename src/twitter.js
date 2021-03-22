const needle = require("needle");
const dotenv = require("dotenv").config();
const { sendMessages } = require("./messaging");

const rulesURL = "https://api.twitter.com/2/tweets/search/stream/rules";
const streamURL = "https://api.twitter.com/2/tweets/search/stream";

const token = process.env.TWITTER_API_BEARER_TOKEN;

// Edit rules as desired here below
const rules = [
  { value: "from:C19VaxxUpdates -is:reply", tag: "nj updates" },
  { value: "from:nj_vaccine -is:reply", tag: "nj updates 2" },
  { value: "from:turbovax -is:reply", tag: "ny updates" },
  // { value: "dog has:images -is:retweet", tag: "dog pictures" },
  // { value: "cat has:images -grumpy", tag: "cat pictures" },
];

async function getAllRules() {
  const response = await needle("get", rulesURL, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  if (response.statusCode !== 200) {
    throw new Error(JSON.stringify(response.body));
    return null;
  }

  return response.body;
}

async function deleteAllRules(rules) {
  if (!Array.isArray(rules.data)) {
    return null;
  }

  const ids = rules.data.map((rule) => rule.id);

  const data = {
    delete: {
      ids: ids,
    },
  };

  const response = await needle("post", rulesURL, data, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(JSON.stringify(response.body));
    return null;
  }

  return response.body;
}

async function setRules() {
  const data = {
    add: rules,
  };

  const response = await needle("post", rulesURL, data, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(JSON.stringify(response.body));
    return null;
  }

  return response.body;
}

async function streamConnect(mongoClient, SES, SNS) {
  //Listen to the stream
  try {
    let connectionIssue = null;
    const stream = await needle.get(streamURL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 20000,
    });

    stream
      .on("data", async (data) => {
        try {
          if (data.status === 401) {
            console.error("Stream unauthorized ", data);
            return;
          }
          if (
            data.connection_issue &&
            data.connection_issue === "TooManyConnections"
          ) {
            console.log("Stream refused to connect, too many connections");
            stream.emit("timeout");
            return;
          }
          const json = JSON.parse(data);
          console.log(json);
          const text = json.data.text;
          sendMessages(SNS, mongoClient, text);
        } catch (e) {
          const errMsg = String(e.message);
          if (errMsg.includes("Unexpected end of JSON input")) {
            console.log("No new messages, continue...");
          } else {
            console.error(e);
          }
          // Keep alive signal received. Do nothing.
        }
      })
      .on("error", (error) => {
        console.log("stream error: ", error);
        if (error.code === "ETIMEDOUT") {
          stream.emit("timeout");
        }
      });

    return stream;
  } catch (e) {
    console.error("Could not initiate stream, error: ", e);
  }
}

let filteredStream = null;
let timeout = 10;

async function streamInit(mongoClient, SES, SNS) {
  console.log("Initiating stream ");
  let currentRules;

  // Listen to the stream.
  // This reconnection logic will attempt to reconnect when a disconnection is detected.
  // To avoid rate limites, this logic implements exponential backoff, so the wait time
  // will increase if the client cannot reconnect to the stream.
  if (!filteredStream) {
    try {
      // Gets the complete list of rules currently applied to the stream
      currentRules = await getAllRules();

      // Delete all rules. Comment the line below if you want to keep your existing rules.
      await deleteAllRules(currentRules);

      // Add rules to the stream. Comment the line below if you don't want to add new rules.
      await setRules();
    } catch (e) {
      console.error(e);
      // process.exit(-1);
    }
  }

  filteredStream = await streamConnect(mongoClient, SES, SNS);

  filteredStream.on("timeout", () => {
    // Reconnect on error
    console.warn(
      `A connection error occurred. Reconnecting after timeout: ${timeout}…`
    );
    setTimeout(() => {
      timeout++;
      streamInit(mongoClient, SES, SNS);
    }, 2 ** timeout);
  });
  return filteredStream;
}

module.exports = {
  streamInit,
};
