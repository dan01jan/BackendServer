const express = require('express');
const router = express.Router();
const { Response } = require('../models/response');
const { Question } = require('../models/question');
const { Trait } = require('../models/trait');

// Create User's Response
router.post('/', async (req, res) => {
    const { questions, userId, questionnaireId } = req.body;

    console.log("Received Questions:", questions);

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ success: false, message: "No responses provided." });
    }

    if (!questionnaireId) {
        return res.status(400).json({ success: false, message: "Questionnaire ID is required." });
    }

    try {
        console.log("Received request body:", req.body);

        const allQuestions = questions.map(question => {
            if (!question.questionId || question.rating == null) {
                throw new Error("Each question must have 'questionId' and 'rating'.");
            }
            return {
                questionId: question.questionId,
                rating: question.rating,
            };
        });
        const responseDocument = new Response({
            questionnaireId,
            userId,           
            questions: allQuestions, 
        });

        const savedResponse = await responseDocument.save();

        res.status(201).json({ success: true, data: savedResponse });
    } catch (error) {
        console.error("Error inserting responses:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// router.get('/average-ratings', async (req, res) => {
//     try {
//       // Aggregate the responses to get average ratings per user and event
//       const aggregationResult = await Response.aggregate([
//         {
//           // Step 1: Lookup the associated Questionnaire and Event to get eventId
//           $lookup: {
//             from: 'questionnaires', // Collection name for Questionnaire model
//             localField: 'questionnaireId',
//             foreignField: '_id',
//             as: 'questionnaire',
//           },
//         },
//         {
//           // Step 2: Unwind the questionnaire to get access to the eventId
//           $unwind: '$questionnaire',
//         },
//         {
//           // Step 3: Group by eventId and userId, calculating average for each question
//           $group: {
//             _id: { eventId: '$questionnaire.eventId', userId: '$userId' },
//             averageRatings: {
//               $push: {
//                 $avg: '$questions.rating', // Calculate average for all ratings
//               },
//             },
//           },
//         },
//         {
//           // Step 4: Format result for easier interpretation
//           $project: {
//             eventId: '$_id.eventId',
//             userId: '$_id.userId',
//             averageRatings: 1,
//             _id: 0,
//           },
//         },
//       ]);
  
//       // Send back the results in the response
//       res.status(200).json({
//         success: true,
//         data: aggregationResult,
//       });
//     } catch (error) {
//       console.error('Error calculating average ratings:', error);
//       res.status(500).json({
//         success: false,
//         message: 'An error occurred while calculating the average ratings.',
//       });
//     }
// });

module.exports = router;
