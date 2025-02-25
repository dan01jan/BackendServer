const express = require('express');
const router = express.Router();
const { Questionnaire } = require('../models/questionnaire');
const { Question } = require('../models/question');
const { Trait } = require('../models/trait');
const { Event } = require('../models/event');
const { Response } = require('../models/response');
const { User } = require('../models/user');  // Import the User model

// Create Questionnaire
router.post('/create', async (req, res) => {
  const { eventId, selectedQuestions } = req.body;

  if (!eventId || !selectedQuestions || selectedQuestions.length === 0) {
    return res.status(400).json({ message: "Event ID and selected questions are required" });
  }

  try {
    // Step 1: Create the Questionnaire
    const questionnaire = new Questionnaire({
      eventId,
      questions: selectedQuestions,
    });

    const savedQuestionnaire = await questionnaire.save();

    // Step 2: Update the selectedQuestion field for the chosen questions
    try {
      await Question.updateMany(
        { _id: { $in: selectedQuestions } },
        { $set: { selectedQuestion: true } }
      );

      // Step 3: Update the hasQuestionnaire field in the Event model
      await Event.findByIdAndUpdate(
        eventId,
        { $set: { hasQuestionnaire: true } },
        { new: true }
      );

      res.status(201).json({
        message: "Questionnaire created successfully and event updated",
        questionnaire: savedQuestionnaire,
      });
    } catch (updateError) {
      console.error('Error updating selected questions:', updateError);

      // Rollback: Delete the created Questionnaire
      await Questionnaire.findByIdAndDelete(savedQuestionnaire._id);
      res.status(500).json({ message: "Error updating selected questions", error: updateError });
    }
  } catch (error) {
    console.error('Error creating questionnaire:', error);
    res.status(500).json({ message: "Error creating questionnaire", error });
  }
});

// Randomize and Create Questionnaire
router.post('/randomize-create', async (req, res) => {
  const { eventId } = req.body;

  if (!eventId) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  try {
    // Step 1: Get all distinct traits from the database
    const traits = await Question.distinct("traitId");

    if (!traits || traits.length === 0) {
      return res.status(404).json({ message: "No traits found" });
    }

    let selectedQuestions = [];

    // Step 2: Loop through each trait and select 5 random questions
    for (const traitId of traits) {
      const questions = await Question.find({ traitId });

      if (questions.length < 5) {
        return res.status(400).json({
          message: `Not enough questions for trait ${traitId}. Minimum 5 required.`,
        });
      }

      // Shuffle and select exactly 5 questions
      const shuffled = questions.sort(() => 0.5 - Math.random());
      selectedQuestions.push(...shuffled.slice(0, 5));
    }

    // Extract just the question IDs
    const selectedQuestionIds = selectedQuestions.map(q => q._id);

    // Step 3: Create the Questionnaire
    const questionnaire = new Questionnaire({
      eventId,
      questions: selectedQuestionIds,
    });

    const savedQuestionnaire = await questionnaire.save();

    // Step 4: Update the selectedQuestion field for the chosen questions
    await Question.updateMany(
      { _id: { $in: selectedQuestionIds } },
      { $set: { selectedQuestion: true } }
    );

    // Step 5: Update the hasQuestionnaire field in the Event model
    await Event.findByIdAndUpdate(
      eventId,
      { $set: { hasQuestionnaire: true } },
      { new: true }
    );

    res.status(201).json({
      message: "Randomized questionnaire created successfully",
      questionnaire: savedQuestionnaire,
    });

  } catch (error) {
    console.error("Error creating randomized questionnaire:", error);
    res.status(500).json({ message: "Server error", error });
  }
});


// Get Questionnaire
router.get('/', async (req, res) => {
    try {
        const questionnaires = await Questionnaire.find().populate('userId', 'name email');
        res.status(200).json(questionnaires);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving questionnaires", error });
    }
});

// router.get('/:id', async (req, res) => {
//   try {
//     const questionnaireId = req.params.id;
//     const questionnaire = await Questionnaire.findById(questionnaireId);
    
//     // If no questionnaire is found, return an empty object or message, instead of 404 error
//     if (!questionnaire) {
//       return res.status(200).json({ message: 'No questionnaire found for the provided ID.' });
//     }
    
//     res.status(200).json(questionnaire); // Return the questionnaire if found
//   } catch (error) {
//     console.error('Error fetching questionnaire:', error);
//     res.status(500).json({ message: 'Server error' }); // General server error
//   }
// });

// Get Event's Behavioral Analysis Ratings
router.get('/aggregated-ratings', async (req, res) => {
  try {
    const { eventId, userId } = req.query;

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required." });
    }
    const questionnaires = await Questionnaire.find({ eventId });
    if (!questionnaires || questionnaires.length === 0) {
      return res.status(200).json({ aggregatedRatings: [], users: [] });
    }

    const questionnaireIds = questionnaires.map(q => q._id);

    const responses = await Response.find({ 'questionnaireId': { $in: questionnaireIds } })
      .populate({
        path: 'questions.questionId',
        populate: { path: 'traitId' },
      });

    const users = await Response.find({ 'questionnaireId': { $in: questionnaireIds } })
      .distinct('userId');

    let userInfo = null;
    if (userId) {
      userInfo = await User.findById(userId).select('name surname email role organization department course section image');
    }

    if (!responses || responses.length === 0) {
      return res.status(200).json({ aggregatedRatings: [], users, userInfo });
    }

    const traitRatings = {};
    responses
      .filter(response => !userId || response.userId.toString() === userId.toString())  // If no userId, return ratings for all users
      .forEach((response) => {
        if (!response.questions) {
          return;
        }

        const responseTraitScores = {};
        response.questions.forEach((question) => {
          const trait = question.questionId.traitId.trait;
          const rating = question.rating;

          if (!trait || typeof rating !== 'number') {
            return;
          }

          if (!responseTraitScores[trait]) {
            responseTraitScores[trait] = 0;
          }
          responseTraitScores[trait] += rating;
        });

        Object.keys(responseTraitScores).forEach((trait) => {
          if (!traitRatings[trait]) {
            traitRatings[trait] = { totalScore: 0, totalResponses: 0 };
          }

          traitRatings[trait].totalScore += responseTraitScores[trait]/5;
          traitRatings[trait].totalResponses += 1;
        });
      });

    const aggregatedRatings = Object.keys(traitRatings).map((trait) => {
      const { totalScore, totalResponses } = traitRatings[trait];
      return {
        trait,
        averageRating: Math.round((totalScore / totalResponses) * 100) / 100,
        totalResponses,
      };
    });

    res.status(200).json({ aggregatedRatings, users, userInfo });

  } catch (error) {
    console.error('Error in /aggregated-ratings:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get('/:eventId', async (req, res) => {
    try {
      const { eventId } = req.params;
      
      const questionnaire = await Questionnaire.findOne({ eventId });
  
      if (!questionnaire) {
        return res.status(404).json({ message: 'Questionnaire not found for this event' });
      }
  
      res.status(200).json({ acceptingResponses: questionnaire.acceptingResponses });
    } catch (error) {
      console.error('Error fetching questionnaire:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
// Get Event's Questionnaire Questions
router.get('/event/:eventId', async (req, res) => {
    try {
      const { eventId } = req.params;
      const questionnaire = await Questionnaire.findOne({ eventId })
        .populate('questions')
        .populate({
          path: 'questions',
          populate: { path: 'traitId' },
        });
  
      if (!questionnaire) {
        return res.status(404).json({ message: 'Questionnaire not found' });
      }
  
      const responseCount = await Response.countDocuments({ questionnaireId: questionnaire._id });
  
      res.status(200).json({
        questionnaireId: questionnaire._id, 
        questionnaire: questionnaire,
        responseCount: responseCount,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
// Checks if Event has Questionnaire, used on opening and closing the questionnaire
router.get('/check-questionnaire/:eventId', async (req, res) => {
  try {
      const { eventId } = req.params;

      const existingQuestionnaire = await Questionnaire.findOne({ eventId });

      if (existingQuestionnaire) {
          return res.status(200).json({ 
              hasQuestionnaire: true, 
              acceptingResponses: existingQuestionnaire.acceptingResponses,
          });
      } else {
          return res.status(200).json({ 
              hasQuestionnaire: false, 
              acceptingResponses: false,
          });
      }
  } catch (error) {
      console.error('Error checking for questionnaire:', error);
      return res.status(500).json({ message: 'Server error' });
  }
});


// Route to update the acceptingResponses field for a specific questionnaire
router.put('/accepting-responses/:eventId', async (req, res) => {
    const { eventId } = req.params;
    const { acceptingResponses } = req.body;
  
    if (typeof acceptingResponses !== 'boolean') {
      return res.status(400).json({ message: "acceptingResponses must be a boolean value" });
    }
  
    try {
      const questionnaire = await Questionnaire.findOne({ eventId });
  
      if (!questionnaire) {
        return res.status(404).json({ message: 'Questionnaire not found for this event' });
      }
  
      questionnaire.acceptingResponses = acceptingResponses;
      await questionnaire.save();
  
      res.status(200).json({
        message: 'Accepting responses updated successfully',
        acceptingResponses: questionnaire.acceptingResponses,
      });
    } catch (error) {
      console.error('Error updating acceptingResponses:', error);
      res.status(500).json({ message: 'Server error', error });
    }
  });
  

module.exports = router;
