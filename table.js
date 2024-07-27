const { google } = require("googleapis");
const credentials = require("./credentials.json");
const urlencode = require("urlencode");
// const spreadsheetId = "1JEGhYdvXNXc5bjDS5nWE4wgsKW-A1hC6LYlu5IiEHHE";
const spreadsheetId = "1Q3nkt8Htt0-8VUR8r4_I6EEDM2rMp0axi8oMnsuReY0";
const { getAllRules } = require("./database/job");
const { changeStats, getSourcerStats } = require("./database/dailyStats");
const { findUserByEmail } = require("./database/user");
const {getRegexForAllSkills} = require("./database/allSkills");

// Function to authorize the Google API client using JWT
async function authorize(){
  const JwtClient = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return JwtClient;
}

// Function to retrieve links (back, next), verify sourcer and return relevant jobs and all skills
module.exports.getLinks = function (data) {
  console.log("getting links...");
  authorize()
    .then((res) => findLinks(res, data))
    .catch(console.error);
};

// Function to update candidate's data with scraped data and sourcer's stats
module.exports.updateCandidate = function (candidate, data){
  authorize()
    .then((res) => findCandidate(res, candidate, data))
    .catch(console.error);
}

// Fins next/back links, verify sourcer, retriev relevant jobs and skills for scraping
async function findLinks(JwtClient, data) {
  const sheets = google.sheets({ version: "v4", auth: JwtClient });

  // Determine the sheet name and range based on the data.mode
  let sheetName;
  console.log("data.mode")
  console.log(data.mode)
  if (data.mode === "people") {
    sheetName = "List";
  } else if (data.mode === "company") {
    sheetName = "Companies";
  } else {
    data.response.status(400);
    data.response.json({
      error: "Invalid mode. Please specify 'people' or 'company'."
    });
    data.response.end();
    return;
  }
  const range = `${sheetName}!A:AE`;
  console.log("range:")
  console.log(range)
  sheets.spreadsheets.values.get(
    {
      spreadsheetId: spreadsheetId,
      range: range,
    },
    async (err, res) => {
      if (err) {
        return console.log("The API returned an error: " + err);
      }
      // Fetch all rules related to the current sourcer
      const rules = await getAllRules(data.owner);
      // If there are no rules for the sourcer, then stop function as sourcer unauthorized
      if (rules.length === 0) {
        data.response.status(200);
        data.response.json({
          back: "",
          next: "",
          skills: [],
          rules: [],
          alert: `You don't have any projects : (`,
        });
        data.response.end();
        return;
      }
      // Fetch sourcer data by email
      const user = await findUserByEmail(
        `${data.owner.toLowerCase()}@scaleup.agency`
      );
      // Fetch statistics related to the sourcer
      const stats = await getSourcerStats(user.id);

      // Extract the spreadsheet's row data from the response
      const rows = res.data.values;
      console.log("spreadsheet rows data")
      console.log(rows)
      // Find the row indexs related to the current candidate
      let indxs = findRow(rows, data);
      // In case of duplicates, choose last one duplicate in the spreadsheet
      let indx = indxs[indxs.length - 1];

      // Check if we found a valid candidate's row. If not, return error
      if (indx < rows.length) {
        let alert = null;
        // If candidate is already sourced, return alert message
        if (rows[indx][1]) {
          alert = `This is ${rows[indx][1]}'s candidate, please choose another one!`;
        }
        // Calculate the previous candidate's row index
        let offset = 1;
        // While we are not on the first (header) row and candidate column "Reviewed" doesn't have some value and it is not "no" continue iteration
        while (
          indx - offset > 0 &&
          !rows[indx - offset][rows[indx - offset].length - 1] &&
          rows[indx - offset][rows[indx - offset].length - 1].toLowerCase() !==
            "no"
        ) {
          offset++;
        }
        // If after iteration we are not at first row (header), then get link to the previous profile ("LIprofile - Old" column)
        let back = "";
        if (indx - offset > 0) {
          back = rows[indx - offset][5];
        }
        // Calculate the next candidate's row index
        indx++;
        // While we are not on the last row and candidate column "Reviewed" doesn't have some value and it is not "no" continue iteration
        while (
          indx < rows.length &&
          !rows[indx][rows[indx].length - 1] &&
          rows[indx][rows[indx].length - 1].toLowerCase() !== "no"
        ) {
          indx++;
        }
        // If after iteration we are not out of spreadsheet, then get link to the previous profile ("LIprofile - Old" column)
        let next = "";
        if (indx < rows.length) {
          next = rows[indx][5];
        }
        // If both the previous and next candidate URLs are empty, return an error
        if (!back && !next) {
          data.response.status(500);
          data.response.json({
            error: `Both links (Back/Next) are empty`,
          });
          data.response.end();
        } else {
          const allSkills = await getRegexForAllSkills();
          data.response.status(200);
          data.response.json({
            back: back,
            next: next,
            skills: allSkills,
            rules: rules,
            stats: await calcStats(stats.stats),
            alert: alert,
          });
          data.response.end();
        }
      } else {
        data.response.status(500);
        data.response.json({
          error: `Candidate not found`,
        });
        data.response.end();
      }
    }
  );
}


// Function to find a candidate in the specified spreadsheet
async function findCandidate(JwtClient, candidate, data){
  let sheetName;
  if (data.mode === "people") {
    sheetName = "List";
  } else if (data.mode === "company") {
    sheetName = "Companies";
  } else {
    data.response.status(400);
    data.response.json({
      error: "Invalid mode. Please specify 'people' or 'company'."
    });
    data.response.end();
    return;
  }
  const range = `${sheetName}!A:AE`;
  console.log("range2:")
  console.log(range)
  const sheets = google.sheets({ version: "v4", auth: JwtClient });
  sheets.spreadsheets.values.get(
    {
      spreadsheetId: spreadsheetId,
      range: range,
    },
    async (err, res) => {
      if (err) {
        return console.log("The API returned an error: " + err);
      }
      // Extract the rows from the response
      const rows = res.data.values;
      // Find the rows that match the given candidate
      let indxs = findRow(rows, candidate);
      // If no rows match the candidate, send a 500 status code and end the response
      if (indxs.length === 0) {
        candidate.response.status(500);
        candidate.response.json({ error: "Candidate not found" });
        candidate.response.end();
      } else {
        // For each index in indxs (in case there is duplicate in the spreadsheet, so we will update all occurrences of this candidate in the spreadsheet)
        for (let i in indxs) {
          // Increment the index by 1 as in the spreadsheet's API indexes from 1
          indxs[i]++;
          // Attempt to update the candidate and capture the result
          let result = await updateCandidate(JwtClient, indxs[i], candidate);
          // If there's an error in updating the candidate, log it, send a 500 status code, and end the response

          if (
            result &&
            result.errors &&
            result.errors[0] &&
            result.errors[0].message
          ) {
            console.log(
              "Error when filling in the candidate data. " +
                result.errors[0].message
            );
            candidate.response.status(500);
            candidate.response.json({
              error:
                "Error when filling in the candidate data. " +
                result.errors[0].message,
            });
            candidate.response.end();
            break;
          }
        }
        // Find the user with the provided sourcer's email
        const user = await findUserByEmail(
          `${candidate.owner.toLowerCase()}@scaleup.agency`
        );
        // Update the sourcer's stats
        const stats = await changeStats(
          user.id,
          candidate.sourcingJob,
          candidate.relevant,
          candidate.encodedUrl,
          rows[indxs[indxs.length - 1] - 1]
        );
        // Send a 200 status code, along with a success message and the updated stats
        candidate.response.status(200);
        candidate.response.json({
          res: `The data for the candidate with the name ${
            candidate.name
          } has been added on the row(s): ${indxs.map((indx) => indx)}`,
          stats: await calcStats(stats.stats),
        });
        candidate.response.end();
      }
    }
  );
}

// Function to update a candidate's data in the specified spreadsheet on the given row
async function updateCandidate(JwtClient, row, candidate) {
  const sheets = google.sheets({ version: "v4", auth: JwtClient });
  try {
    const response = (
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `List!A${row}:Z${row}`,
        // values in the rows will be interpreted as they were entered be user in UI, like automatic hyperlikeing, date formating etc.
        valueInputOption: "USER_ENTERED",
        resource: {
          majorDimension: "ROWS",
          values: [
            [
              candidate.name,
              candidate.owner.trim(),
              candidate.status,
              ,
              candidate.relevant,
              ,
              candidate.encodedUrl,
              candidate.connections,
              candidate.currentPosition,
              ,
              candidate.university.university,
              candidate.university.graduationYear,
              candidate.currentCompany,
              candidate.yearInCurrent,
              candidate.experience,
              ,
              candidate.currentType,
              candidate.skills,
              candidate.reachoutTopic,
              candidate.reachoutComment,
              ,
              ,
              ,
              candidate.sourcingJob,
              candidate.allSkills
            ],
          ],
        },
      })
    ).data;
    return response;
  } catch (err) {
    return err;
  }
}

// Function to find a row in the spreadsheet based on certain criteria
function findRow(rows, data){
  data.encodedUrl = data.url;
  // Parse the url data using the urlencode module. This converts the encoded URL into an object of key-value pairs.
  data.url = urlencode.parse(data.url);
  // Assign the first key of the parsed url object to data.url
  data.url = Object.keys(data.url)[0];

  console.log("parsed url object")
  console.log(data.url)

  let indx = 0;
  // Initialize result indexes array to store the indexes where certain conditions are met (can be multiple matches because of duplicated profiles)
  let resultIndxs = [];
  for (indx in rows) {
    // Check if the candidate's name matches, there is no sourcer's initials in the second cell of the row, and the last cell ("Reviewed") value of the row is not "yes" (case insensitive)
    if (
      rows[indx][0] == data.name &&
      !rows[indx][1] &&
      rows[indx][rows[indx].length - 1].toLowerCase() !== "yes"
    ) {
      resultIndxs.push(indx);
      break;
    }
  }
  // If no indexes have been added to the result indexes array
  if (resultIndxs.length === 0) {
    indx = 0;
    // Iterate over all rows again, but now try to find by "LIprofile - New" columns and without filtering out reviewed profiles (for example for updating data )
    for (indx in rows) {
      let link = "";
      if (rows[indx][6]) {
        // Parse the URL into an object of key-value pairs and assign the first key to the link variable
        link = urlencode.parse(rows[indx][6]);
        link = Object.keys(link)[0];
        console.log("link from sheet")
        console.log(link)
      }
      // Check if the candidate's name matches and the parsed link matches the URL data
      if (rows[indx][0] == data.name && data.url == link) {
        resultIndxs.push(indx);
      }
    }
  }
  return resultIndxs;
}

// Get total stats from all jobs
async function calcStats(stats){
  let totalRelevant = 0;
  let totalUnrelevant = 0;
  if(stats){
    for (const i in stats) {
      const job = stats[i];
      totalRelevant += job.relevant || 0;
      totalUnrelevant += job.unrelevant || 0;
    }
  }
  return {
    total: totalRelevant + totalUnrelevant,
    relevant: totalRelevant,
    unrelevant: totalUnrelevant
  }
}