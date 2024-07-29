const { Rettiwt } = require('rettiwt-api');
const Sentiment = require('sentiment');
const nodemailer = require('nodemailer');
const sentiment = new Sentiment();

const API_KEY = 'api key'; // Replace with your actual API key

const rettiwt = new Rettiwt({ apiKey: API_KEY, logging: true });

const traders = ['insert traders']; // put your shit coin traders 

const falsePositives = ['reclaiming', 'chart', 'range', 'that', 'billy', 'usd']; // Add more false positives if needed

async function fetchTweets(usernames, hours = 24) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
  let tweetsData = [];

  for (const username of usernames) {
    try {
      const result = await rettiwt.tweet.search({
        fromUsers: [username],
        startDate: startTime,
        endDate: endTime,
        count: 100
      });

      console.log(`Fetched tweets for ${username}:`, result);

      if (result.list && Array.isArray(result.list)) {
        for (const tweet of result.list) {
          const tweetTime = new Date(tweet.createdAt);
          if (tweetTime >= startTime && tweetTime <= endTime) {
            const sentimentScore = sentiment.analyze(tweet.fullText).comparative;
            const sentimentLabel = sentimentScore > 0 ? 'bullish' : (sentimentScore < 0 ? 'bearish' : 'neutral');
            tweetsData.push({
              user: username,
              text: tweet.fullText,
              sentiment: sentimentLabel,
              created_at: tweetTime
            });
          }
        }
      } else {
        console.log(`No tweets found for ${username}`);
      }
    } catch (error) {
      console.error(`Error fetching tweets for ${username}: ${error.message}`);
    }
  }

  return tweetsData;
}

function summarizeSentiment(tweetsData) {
  let userSentiments = {};
  let sentimentSummary = { bullish: 0, bearish: 0, neutral: 0, not_trading: 0 };
  let coinMentions = {};
  let priceMentions = [];

  for (const data of tweetsData) {
    if (!userSentiments[data.user]) {
      userSentiments[data.user] = { bullish: 0, bearish: 0, neutral: 0 };
    }

    userSentiments[data.user][data.sentiment]++;
    const words = data.text.split(' ');

    // Track positions of coin mentions
    let coinIndices = [];
    words.forEach((word, index) => {
      if (word.startsWith('$') && /^[A-Za-z]+$/.test(word.slice(1)) && !falsePositives.includes(word.slice(1).toLowerCase())) {
        coinMentions[word] = (coinMentions[word] || 0) + 1;
        coinIndices.push(index);
      }
    });

    // Capture prices mentioned near coin symbols
    coinIndices.forEach(index => {
      const range = 3; // Check within 3 words before and after the coin symbol
      for (let i = Math.max(0, index - range); i <= Math.min(words.length - 1, index + range); i++) {
        if (/^\d+(\.\d+)?$/.test(words[i])) {
          priceMentions.push(words[i]);
        }
      }
    });
  }

  for (const [user, sentiments] of Object.entries(userSentiments)) {
    const userSentiment = Object.keys(sentiments).reduce((a, b) => sentiments[a] > sentiments[b] ? a : b);
    sentimentSummary[userSentiment]++;
  }

  const majoritySentiment = Object.keys(sentimentSummary).reduce((a, b) => sentimentSummary[a] > sentimentSummary[b] ? a : b);
  const majorityPercentage = (sentimentSummary[majoritySentiment] / Object.keys(userSentiments).length) * 100 || 0;

  return {
    sentimentSummary,
    coinMentions,
    priceMentions,
    majoritySentiment,
    majorityPercentage
  };
}

function createSummaryReport(summary) {
  let report = [];

  for (const [sentiment, count] of Object.entries(summary.sentimentSummary)) {
    report.push(`${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}: ${count}`);
  }

  report.push('\nCoins Mentioned:');
  for (const [coin, count] of Object.entries(summary.coinMentions)) {
    report.push(`${coin}: ${count}`);
  }

  report.push('\nPrices Mentioned:');
  report.push(...summary.priceMentions);

  report.push(`\nMajority Sentiment: ${summary.majoritySentiment.charAt(0).toUpperCase() + summary.majoritySentiment.slice(1)} (${summary.majorityPercentage.toFixed(2)}%)`);

  return report.join('\n');
}

async function sendEmail(report) {
  let transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'your_email@example.com', // Replace with your Outlook email
      pass: 'your_email_password' // Replace with your Outlook email password
    }
  });

  let mailOptions = {
    from: 'your_email@example.com', // Replace with your Outlook email
    to: 'recipient@example.com', // Replace with the recipient email
    subject: 'Daily Crypto Sentiment Report',
    text: report
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
  } catch (error) {
    console.error('Error sending email: ', error);
  }
}

(async () => {
  const tweetsData = await fetchTweets(traders);
  console.log('Fetched tweets data:', tweetsData);
  const summary = summarizeSentiment(tweetsData);
  const report = createSummaryReport(summary);

  console.log(report);

  await sendEmail(report);
})();
