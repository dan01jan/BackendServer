const express = require('express');
const router = express.Router();
const { Rating } = require('../models/ratings');
const mongoose = require('mongoose');
const http = require("https");


  router.get(`/`, async (req, res) => {
      const ratings = await Rating.find().populate('rating');

      if (!ratings) {
          res.status(500).json({ success: false })
      }
    
      res.status(201).json(ratings)
  })

const translateToEnglish = (feedback) => {
    return new Promise((resolve, reject) => {
      const options = {
        method: 'POST',
        hostname: 'deep-translate1.p.rapidapi.com',
        path: '/language/translate/v2',
        headers: {
          'x-rapidapi-key': '399f60b0a8msha51621c4a21e43dp1cae58jsne35e1321da38',
          'x-rapidapi-host': 'deep-translate1.p.rapidapi.com',
          'Content-Type': 'application/json',
        },
      };
  
      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
  
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          const result = JSON.parse(body);
          console.log("Orig Text", feedback)
        //   console.log("ano to ulit: ", result)
          const translatedText = result.data.translations.translatedText[0];
          console.log("Translated Text: ", translatedText);
          resolve(translatedText);
        });
      });
  
      req.on('error', (err) => reject(err));
  
      req.write(
        JSON.stringify({
          q: feedback,
          source: 'auto',
          target: 'en',
        })
      );
      req.end();
    });
  };
  
  // const analyzeSentiment = (feedback) => {
  //   return new Promise((resolve, reject) => {
  //     const options = {
  //       method: "POST",
  //       hostname: "sentiment-analysis9.p.rapidapi.com",
  //       path: "/sentiment",
  //       headers: {
  //         "x-rapidapi-key": "98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b",
  //         "x-rapidapi-host": "sentiment-analysis9.p.rapidapi.com",
  //         "Content-Type": "application/json",
  //         Accept: "application/json",
  //       },
  //     };
  
  //     const req = http.request(options, (res) => {
  //       const chunks = [];
  
  //       res.on("data", (chunk) => {
  //         chunks.push(chunk);
  //       });
  
  //       res.on("end", () => {
  //         const body = Buffer.concat(chunks).toString();
  //         resolve(JSON.parse(body));
  //       });
  //     });
  
  //     req.on("error", (err) => reject(err));
  
  //     req.write(
  //       JSON.stringify([
  //         {
  //           id: "1",
  //           language: "en",
  //           text: feedback,
  //         },
  //       ])
  //     );
  //     req.end();
  //   });
  // };

  // const analyzeSentiment = (translatedFeedback) => {
  //   return new Promise((resolve, reject) => {
  //     const options = {
  //       method: 'POST',
  //       hostname: 'sentimentsnap-api3.p.rapidapi.com',
  //       port: null,
  //       path: '/v1/sentiment',
  //       headers: {
  //         'x-rapidapi-key': '98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b',
  //         'x-rapidapi-host': 'sentimentsnap-api3.p.rapidapi.com',
  //         'Content-Type': 'application/json'
  //       }
  //     };
      
  //     const req = http.request(options, (res) => {
  //       let data = '';
  
  //       res.on('data', (chunk) => {
  //         data += chunk;
  //       });
  
  //       res.on('end', () => {
  //         try {
  //           const jsonResponse = JSON.parse(data);
  //           console.log("Sentiment API Response:", jsonResponse);
  //           resolve(jsonResponse);
  //         } catch (error) {
  //           reject(`Error parsing sentiment API response: ${error.message}`);
  //         }
  //       });
  //     });
  
  //     req.on('error', (error) => reject(`HTTP request error: ${error.message}`));
  
  //     req.write(JSON.stringify({ text: translatedFeedback }));
  //     req.end();
  //   });
  // };

  const analyzeSentiment = (translatedFeedback) => {
    return new Promise((resolve, reject) => {
      const options = {
        method: 'POST',
        hostname: 'sentiment-analysis9.p.rapidapi.com',
        port: null,
        path: '/sentiment',
        headers: {
          'x-rapidapi-key': '98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b',
          'x-rapidapi-host': 'sentiment-analysis9.p.rapidapi.com',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      };
  
      const req = http.request(options, function (res) {
        const chunks = [];
  
        res.on('data', function (chunk) {
          chunks.push(chunk);
        });
  
        res.on('end', function () {
          const body = Buffer.concat(chunks);
          try {
            const json = JSON.parse(body.toString());
            // ✅ Resolve the prediction value directly
            const prediction = json[0]?.predictions[0]?.prediction || "neutral";
            resolve({ sentiment: prediction });
          } catch (error) {
            reject("Failed to parse sentiment API response");
          }
        });
      });
  
      req.on('error', (e) => {
        reject(`Error with sentiment API: ${e.message}`);
      });
  
      req.write(
        JSON.stringify([
          {
            id: "1",
            language: "en",
            text: translatedFeedback,
          },
        ])
      );
      req.end();
    });
  };
  

  
  // Create feedback
  router.post('/', async (req, res) => {
    try {
      const { eventId, userId, score, feedback } = req.body;
  
      const translatedFeedback = await translateToEnglish(feedback);
      console.log("Translated Feedback:", translatedFeedback);
  
      const sentimentResult = await analyzeSentiment(translatedFeedback);
    console.log("Sentiment API Result:", sentimentResult);

    const sentiment = sentimentResult.sentiment;

    if (!sentiment || sentiment.length === 0) {
      throw new Error("No sentiment found in sentiment analysis result");
    }
    const formattedSentiment = sentiment.toLowerCase();
    console.log("Formatted Sentiment:", formattedSentiment);


      const newRating = new Rating({
        eventId,
        userId,
        score,
        feedback,
        sentiment: formattedSentiment,
      });
  
      const savedRating = await newRating.save();
      res.status(201).json(savedRating);
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.get(
    '/event/:eventId/sentiments',
    async (req, res) => {
      const { eventId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ message: 'Invalid eventId format' });
      }
  
      try {
        const ratings = await Rating.find({ eventId })
          .populate('userId', 'name surname')
          .select('sentiment feedback score');
  
        const formatted = ratings.map(r => {
          const name = r.userId
            ? `${r.userId.name} ${r.userId.surname}`
            : 'Unknown User';
          return {
            user:      name,
            sentiment: r.sentiment,
            feedback:  r.feedback,
            score:     r.score
          };
        });
  
        return res.json(formatted);
      } catch (err) {
        console.error('Error fetching event sentiments:', err);
        return res.status(500).json({ message: 'Server error' });
      }
    }
  );
  

  // For Charts, count selected event's sentiments, sentiment datatable, and for the event's scores
  router.get('/:selectedEvent', async (req, res) => {
    const { type } = req.query;
    const selectedEvent = req.params.selectedEvent;

    if (!mongoose.Types.ObjectId.isValid(selectedEvent)) {
        return res.status(400).json({ message: 'Invalid eventId format' });
    }

    const eventId = new mongoose.Types.ObjectId(selectedEvent);

    try {
        if (type === 'counts') {
            const positiveCount = await Rating.countDocuments({ eventId, sentiment: 'positive' });
            const negativeCount = await Rating.countDocuments({ eventId, sentiment: 'negative' });
            const neutralCount = await Rating.countDocuments({ eventId, sentiment: 'neutral' });

            return res.status(200).json({ positive: positiveCount, negative: negativeCount, neutral: neutralCount });
        } else {
            const ratings = await Rating.find({ eventId })
                .populate({
                    path: 'userId',
                    select: 'name surname',
                })
                .select('score feedback sentiment date userId'); 

            const formattedRatings = ratings.length > 0 ? ratings.map(rating => ({
                score: rating.score,
                feedback: rating.feedback,
                sentiment: rating.sentiment,
                date: rating.date,
                user: {
                    id: rating.userId._id,
                    name: `${rating.userId.name} ${rating.userId.surname}`
                }
            })) : [];

            return res.status(200).json(formattedRatings);
        }
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Check if users has feedback for chosen event
  router.get('/:userId/:eventId', async (req, res) => {
      const { userId, eventId } = req.params;

      try {
          const rating = await Rating.findOne({ userId, eventId });

          if (!rating) {
              return res.status(200).json({
                  message: 'No feedback found from this user for this event.',
              });
          }
          res.status(200).json(rating);
          console.log(rating);
      } catch (error) {
          console.error('Error fetching rating:', error);
          res.status(500).json({ error: 'Internal Server Error' });
      }
  });

module.exports = router;
