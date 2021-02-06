const needle = require("needle");
const dotenv = require("dotenv").config();

const phoneNumbers = ["9084035937", "9083344342", "7705680057"];
const emails = ["jnissenbaum18@gmail.com", "nlem@verizon.net", "em@gdnlaw.com"];

const rulesURL = "https://api.twitter.com/2/tweets/search/stream/rules";
const streamURL = "https://api.twitter.com/2/tweets/search/stream";

const token = process.env.TWITTER_API_BEARER_TOKEN;

// Edit rules as desired here below
const rules = [
  { value: "from:C19VaxxUpdates", tag: "updates" },
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

function streamConnect() {
  //Listen to the stream
  const options = {
    timeout: 20000,
  };

  const stream = needle.get(
    streamURL,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    options
  );

  stream
    .on("data", (data) => {
      try {
        const json = JSON.parse(data);
        console.log(json);
        sendMessages(json);
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
      if (error.code === "ETIMEDOUT") {
        stream.emit("timeout");
      }
    });

  return stream;
}

let filteredStream = null;

async function streamInit() {
  console.log("Initiating stream");
  let currentRules;
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

  // Listen to the stream.
  // This reconnection logic will attempt to reconnect when a disconnection is detected.
  // To avoid rate limites, this logic implements exponential backoff, so the wait time
  // will increase if the client cannot reconnect to the stream.
  if (!filteredStream) {
    filteredStream = streamConnect();
  }
  let timeout = 0;
  filteredStream.on("timeout", () => {
    // Reconnect on error
    console.warn("A connection error occurred. Reconnecting…");
    setTimeout(() => {
      timeout++;
      streamConnect(token);
    }, 2 ** timeout);
    streamConnect(token);
  });
}

module.exports = {
  streamInit,
};
