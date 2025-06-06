const express = require('express');
const router = express.Router();
const { Question } = require('../models/question');
const { Trait } = require('../models/trait');
const { Event } = require('../models/event');
const { Type } = require('../models/type');
const mongoose = require('mongoose');

// Fetch Questions and populate Trait and Type details
router.get('/', async (req, res) => {
  try {
    const questions = await Question.find()
      .populate('traitId', 'trait') // Populate traitId field
      .populate('typeId', 'eventType'); // Populate typeId field and select only the `type` field

    res.status(200).send(questions);
  } catch (error) {
    res.status(500).send('Error fetching questions: ' + error.message);
  }
});

// Fetch Questions for Creating Questionnaire
router.get('/questions-with-traits', async (req, res) => {
  try {
      const questions = await Question.find().populate('traitId', 'trait');
      res.status(200).json(questions);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching questions', error });
  }
});

// Create Question Route (Backend)
router.post('/create-question', async (req, res) => {
  try {
    const { question, translated, traitId, typeId } = req.body; // Changed eventId to typeId

    if (!question || !translated || !traitId || !typeId) {
      return res.status(400).send('Question, traitId, and typeId are required');
    }

    // Create a new question, scale will default to [1, 2, 3, 4, 5]
    const newQuestion = new Question({ question, translated, traitId, typeId });
    await newQuestion.save();
    res.status(201).send(newQuestion);
  } catch (error) {
    res.status(500).send('Error creating question: ' + error.message);
  }
});

router.get('/grouped-questions', async (req, res) => {
  try {
    const questions = await Question.aggregate([
      {
        $lookup: {
          from: 'events', // Assuming your event model is named 'events'
          localField: 'eventId',
          foreignField: '_id',
          as: 'eventDetails',
        },
      },
      {
        $unwind: '$eventDetails',
      },
      {
        $lookup: {
          from: 'traits', // Assuming your trait model is named 'traits'
          localField: 'traitId',
          foreignField: '_id',
          as: 'traitDetails',
        },
      },
      {
        $unwind: '$traitDetails',
      },
      {
        $group: {
          _id: '$eventDetails.type', // Group by event type
          questions: {
            $push: {
              question: '$question',
              trait: '$traitDetails.trait', // Assuming 'trait' is a field in Trait model
            },
          },
        },
      },
      {
        $sort: {
          '_id': 1, // Sort by event type
        },
      },
    ]);

    if (questions.length === 0) {
      return res.status(404).json({ message: 'No questions found.' });
    }

    res.status(200).json(questions);
  } catch (error) {
    console.error('Error fetching grouped questions:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

//route for questions based on event type
router.get('/event-type/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Validate eventId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: 'Invalid eventId' });
    }

    // Fetch the event and populate its type
    const event = await Event.findById(eventId).populate('type');
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    if (!event.type) {
      return res.status(404).json({ message: 'Event type not found' });
    }

    console.log('Event:', event);
    console.log('Event Type:', event.type);

    // Use the event type's _id directly as an ObjectId
    const typeId = event.type._id;
    console.log('Searching for questions with typeId:', typeId);

    // Query for questions matching either:
    // 1. The typeId field stored as an ObjectId
    // 2. The typeId field stored as an object with an _id property
    const questions = await Question.find({
      $or: [
        { typeId: typeId },
        { "typeId._id": typeId }
      ]
    })
      .populate('traitId', 'trait')
      .exec();

    if (!questions || questions.length === 0) {
      return res.status(404).json({ message: 'No questions found for this event type' });
    }

    console.log('Questions fetched:', questions);
    res.status(200).json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: error.message });
  }
});


// Bulk Create Questions Route
router.post('/bulk-create-questions', async (req, res) => {
  try {
    const { questions } = req.body; // Expecting an array of questions

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).send('Questions array is required and cannot be empty');
    }

    // Validate each question object
    for (const question of questions) {
      if (!question.question || !question.traitId || !question.typeId) {
        return res.status(400).send('Each question must have a question, traitId, and typeId');
      }
    }

    // Save all questions in one operation
    const createdQuestions = await Question.insertMany(questions);
    res.status(201).send(createdQuestions);
  } catch (error) {
    res.status(500).send('Error creating questions: ' + error.message);
  }
});


// Update Question and populate Trait and Type
router.put('/:id', async (req, res) => {
  try {
    const { question, translated, traitId, typeId } = req.body;
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      { question, translated, traitId, typeId },
      { new: true }
    )
    .populate('traitId', 'trait')
    .populate('typeId', 'eventType');

    if (!updatedQuestion) return res.status(404).send('Question not found.');
    res.send(updatedQuestion);
  } catch (error) {
    res.status(500).send('Error updating question: ' + error.message);
  }
});


// Delete Question
router.delete('/:id', async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);
    if (!deletedQuestion) return res.status(404).send('Question not found.');
    res.send('Question deleted successfully!');
  } catch (error) {
    res.status(500).send('Error deleting question');
  }
});

module.exports = router;
