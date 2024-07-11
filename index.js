/*global fetch*/

const { MongoClient } = require("mongodb");

const { io } = require("socket.io-client");

const socket = io("https://dev.api.betfundr.com");

const mongoUri =
  "mongodb+srv://Dikeprosper:Prosper12@espece.koqsh5m.mongodb.net/";
const dbName = "test";

let cachedDB = null;

const baseUrl = "https://v3.football.api-sports.io/";
const headers = {
  "x-apisports-key": "574378eff4c6fe1ae23f0a8728502088",
};

const liveStatus = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"];

// game data
const getEventsData = async (fixture) =>
  await fetch(`${baseUrl}fixtures/events?fixture=${fixture}`, {
    method: "GET",
    headers,
  }).then((res) => res.json());
const getStatisticsData = async (fixture) =>
  await fetch(`${baseUrl}fixtures/statistics?fixture=${fixture}`, {
    method: "GET",
    headers,
  }).then((res) => res.json());
const getLineupsData = async (fixture) =>
  await fetch(`${baseUrl}fixtures/lineups?fixture=${fixture}`, {
    method: "GET",
    headers,
  }).then((res) => res.json());

// fixtures
const getFixturesForDate = async (date) =>
  await fetch(`${baseUrl}fixtures?date=${date}`, {
    method: "GET",
    headers,
  }).then((res) => res.json());
async function connectToDatabase() {
  if (cachedDB) return cachedDB;

  const client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);
  cachedDB = db;

  return db;
}

exports.handler = async () => {
  try {
    const db = await connectToDatabase();
    const fixturesCollection = db.collection("fixtures");
    const lineupsCollection = db.collection("lineups");
    const statisticsCollection = db.collection("statistics");
    const eventsCollection = db.collection("events");
    
    const today = new Date();

    // Get year, month, and day components
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are zero-based, so add 1
    const day = String(today.getDate()).padStart(2, "0");

    // Format date as yyyy-mm-dd
    const date = `${year}-${month}-${day}`;
    
    const { response } = await getFixturesForDate(date);
    await fixturesCollection.updateOne(
      { date },
      { $set: { fixtures: response } },
      { upsert: true, new: true },
    );

    const liveFixtures = response.filter((item) =>
      liveStatus.includes(item.fixture.status.short),
    );

    const liveFixturesData = [];
    for (let i = 0; i < liveFixtures.length; i++) {
      const { response: lineups } = await getLineupsData(
        liveFixtures[i].fixture.id,
      );
    await lineupsCollection.updateOne({fixture: liveFixtures[i].fixture.id}, {$set: {lineups}}, {upsert: true,new: true})
      const { response: statistics } = await getStatisticsData(
        liveFixtures[i].fixture.id,
      );
    await statisticsCollection.updateOne({fixture: liveFixtures[i].fixture.id}, {$set: {statistics}}, {upsert: true,new: true})
      const { response: events } = await getEventsData(
        liveFixtures[i].fixture.id,
      );
    await eventsCollection.updateOne({fixture: liveFixtures[i].fixture.id}, {$set: {events}}, {upsert: true,new: true})

      liveFixturesData.push({
        fixture: liveFixtures[i],
        lineups,
        statistics,
        events,
      });
    }

    await fetch("https://dev.api.betfundr.com/emit-live-games", {
      method: "POST",
      headers: { "Content-type": "application/json" },
      body: JSON.stringify({ data: liveFixturesData }),
    });
    await fetch("https://dev.api.betfundr.com/emit-fixtures", {
      method: "POST",
      headers: { "Content-type": "application/json" },
      body: JSON.stringify({ data: response }),
    });

    console.log("updated fixtures");
    return { success: true, fixture: response };
  } catch (err) {
    return { error: err };
  }
};
