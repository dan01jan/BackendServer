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

          // Normalize the trait score (assuming each trait's score is out of 5 per question)
          traitRatings[trait].totalScore += responseTraitScores[trait] / 5;
          traitRatings[trait].totalResponses += 1;
        });
      });

    // Create aggregated ratings array
    const aggregatedRatings = Object.keys(traitRatings).map((trait) => {
      const { totalScore, totalResponses } = traitRatings[trait];
      return {
        trait,
        averageRating: Math.round((totalScore / totalResponses) * 100) / 100,
        totalResponses,
      };
    });

    // Helper function: determine level based on rating thresholds
    const getLevel = (rating) => {
      if (rating >= 4.0) return "High";
      else if (rating < 2.5) return "Low";
      else return "Moderate";
    };

    // Helper function: randomly select an element from an array
    const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Expanded dictionary for trait-specific interpretations
    const traitInterpretations = {
      "Openness": {
         "High": [
             "Your vivid imagination and broad interests open up a world of creative possibilities.",
             "Your high openness leads you to constantly explore new ideas and experiences.",
             "You embrace the unconventional and thrive on creativity and innovation.",
             "Your curiosity knows no bounds, fueling a passion for exploration and learning.",
             "With your high openness, you effortlessly connect abstract ideas to practical solutions."
         ],
         "Moderate": [
             "You balance creativity and practicality, enjoying innovation while appreciating tradition.",
             "You exhibit a healthy mix of curiosity and conventionality, adapting to new ideas with ease.",
             "Your openness is balanced, allowing you to integrate both novel experiences and familiar routines.",
             "You appreciate the beauty of creativity while valuing the comfort of proven methods."
         ],
         "Low": [
             "You prefer the tried-and-true, valuing consistency and familiarity over novelty.",
             "A lower level of openness suggests a grounded approach, relying on conventional wisdom.",
             "You tend to favor routines and proven methods, which provide stability and predictability.",
             "Your preference for the familiar means you approach change with caution.",
             "You value tradition and consistency, often finding comfort in well-established practices."
         ]
      },
      "Conscientiousness": {
         "High": [
             "Your strong sense of duty and organization marks you as reliable and goal-oriented.",
             "High conscientiousness shows you excel at planning and executing tasks meticulously.",
             "You demonstrate an impressive commitment to excellence and attention to detail.",
             "Your disciplined nature ensures that you are always prepared and dependable.",
             "With high conscientiousness, you consistently set and achieve high standards."
         ],
         "Moderate": [
             "Your balanced approach to tasks allows for both structure and spontaneity.",
             "You strike a fair balance between organization and flexibility, which helps you adapt to varying circumstances.",
             "Your planning skills are solid, yet you are open to improvisation when necessary.",
             "You maintain order in your life while still leaving room for creativity and flexibility."
         ],
         "Low": [
             "A lower score indicates a preference for flexibility over rigid planning, often embracing spontaneity.",
             "You tend to be more relaxed about structure, favoring a more free-form approach to tasks.",
             "Your adaptable nature may mean that strict organization is less of a priority.",
             "You prefer to go with the flow rather than adhering to strict schedules or plans.",
             "Less emphasis on conscientiousness suggests you value creativity and spontaneity over structure."
         ]
      },
      "Extraversion": {
         "High": [
             "Your sociable and energetic nature makes you a natural connector in social settings.",
             "High extraversion shows you thrive on interaction and gain energy from being around others.",
             "You are the life of the party, with a magnetic personality that draws people in.",
             "Your outgoing nature makes you an influential and charismatic presence.",
             "With high extraversion, you bring enthusiasm and vibrancy to every social situation."
         ],
         "Moderate": [
             "You enjoy socializing yet value personal time, striking a balance between outgoing and reserved behavior.",
             "Your social nature is well-balanced with introspection, allowing you to connect deeply with others.",
             "You can be both the center of attention and a thoughtful listener, depending on the situation.",
             "Your moderate extraversion ensures you enjoy social interactions without feeling overwhelmed."
         ],
         "Low": [
             "Your reserved nature means you often prefer meaningful, one-on-one interactions over large groups.",
             "Low extraversion suggests you may find solace in quieter, more introspective environments.",
             "You are reflective and prefer deep, thoughtful conversations to large social gatherings.",
             "Your calm and introspective demeanor enables you to form deep and lasting connections.",
             "You appreciate solitude and small, intimate groups where you can be yourself."
         ]
      },
      "Agreeableness": {
         "High": [
             "Your cooperative and empathetic approach makes you a trusted and supportive friend.",
             "High agreeableness shows that you value harmony and are considerate of others' feelings.",
             "Your warmth and compassion make you a natural peacemaker in your community.",
             "You are always ready to lend a helping hand and create positive connections with those around you.",
             "With high agreeableness, you effortlessly foster an environment of trust and respect."
         ],
         "Moderate": [
             "You have a balanced perspective, being kind and understanding while also maintaining your own viewpoints.",
             "Your agreeable nature is balanced with assertiveness, enabling effective communication.",
             "You know how to cooperate with others while also standing up for your own beliefs.",
             "Your personality reflects both empathy and a healthy dose of realism in your interactions."
         ],
         "Low": [
             "A lower score may indicate a more direct and assertive approach, unafraid to express your honest opinions.",
             "You value honesty and may come across as blunt, prioritizing truth over diplomacy.",
             "Your straightforward nature means you are not easily swayed by social expectations.",
             "With lower agreeableness, you tend to challenge ideas and are less inclined to follow the crowd.",
             "Your critical thinking often leads you to question norms, even if it means being less agreeable."
         ]
      },
      "Neuroticism": {
         "High": [
             "A higher level of neuroticism suggests you experience emotions deeply, making you sensitive to life's ups and downs.",
             "Your intense emotional experiences could drive both creativity and occasional stress.",
             "You feel emotions profoundly, which can heighten both your empathy and your vulnerability.",
             "Your heightened sensitivity may lead you to experience life's challenges more acutely.",
             "With high neuroticism, you often feel the full spectrum of emotions, from deep joy to profound sorrow."
         ],
         "Moderate": [
             "A balanced emotional state helps you navigate challenges while remaining connected to your feelings.",
             "Your moderate neuroticism allows you to experience emotions without being overwhelmed by them.",
             "You maintain a healthy emotional equilibrium, balancing sensitivity with resilience.",
             "Your self-awareness helps you manage your emotional responses effectively."
         ],
         "Low": [
             "Your calm demeanor and resilience in stressful situations are hallmarks of low neuroticism.",
             "A low score in neuroticism suggests you handle challenges with a level-headed and composed attitude.",
             "You approach life with a serene confidence, rarely overwhelmed by emotional turbulence.",
             "Your stable emotional state makes you a pillar of strength in times of uncertainty.",
             "With low neuroticism, you enjoy a peaceful outlook on life and rarely let stress get the best of you."
         ]
      }
    };

    // Expanded overall interpretations with numerous options
    const overallInterpretations = {
      "High": [
         "Your profile radiates energy and innovation, making you a natural trailblazer.",
         "You consistently push boundaries, embracing challenges with vigor.",
         "Your high scores reflect a dynamic personality that thrives in fast-paced environments.",
         "A leader in the making, your ambitious spirit drives you to excel.",
         "Your exceptional drive and passion set you apart as a visionary.",
         "You approach life with an infectious enthusiasm that inspires those around you.",
         "Your bold character makes you unafraid of risks and ready for new adventures.",
         "Your vibrant energy lights up every room you enter.",
         "High overall ratings indicate that you are both motivated and influential.",
         "Your dynamic approach to life opens up countless opportunities."
      ],
      "Moderate": [
         "Your balanced approach ensures steady progress and thoughtful decisions.",
         "You maintain a harmonious blend of creativity and stability, adapting well to various situations.",
         "Your measured outlook allows you to tackle challenges without being overwhelmed.",
         "You exhibit a stable and reliable demeanor, making you a dependable presence.",
         "Your moderate scores suggest a well-rounded personality that values balance.",
         "You navigate life with a balanced mix of caution and enthusiasm.",
         "Your profile demonstrates a healthy equilibrium between ambition and reflection.",
         "A balanced perspective allows you to appreciate both the highs and lows of life.",
         "Your even-keeled nature ensures consistent performance in various situations.",
         "Your moderate ratings reflect a pragmatic yet creative approach to life."
      ],
      "Low": [
         "Your calm and measured demeanor allows you to navigate life's challenges with ease.",
         "You prefer stability and consistency, taking a methodical approach to problem-solving.",
         "Your low overall ratings suggest a relaxed and contemplative nature.",
         "You tend to remain composed, often finding comfort in routine and structure.",
         "A steady presence, your profile indicates a thoughtful and deliberate approach to life.",
         "Your overall profile reflects a quiet confidence and a preference for introspection.",
         "Your laid-back nature makes you resilient in the face of adversity.",
         "A low overall score indicates a stable and serene outlook on life.",
         "Your measured responses and calm approach create a sense of reliability.",
         "Your thoughtful perspective allows you to appreciate the simple pleasures in life."
      ]
    };

    // Add an interpretation and level for each trait rating
    const ratingsWithInterpretation = aggregatedRatings.map(item => {
      const level = getLevel(item.averageRating);
      const interpretation = (traitInterpretations[item.trait] &&
                              traitInterpretations[item.trait][level])
          ? getRandomElement(traitInterpretations[item.trait][level])
          : "No interpretation available.";
      return { ...item, level, interpretation };
    });

    // Compute overall average rating (across all traits) for an overall interpretation
    const overallAvg = aggregatedRatings.reduce((sum, item) => sum + item.averageRating, 0) / aggregatedRatings.length;
    const overallLevel = getLevel(overallAvg);
    const overallInterpretation = overallInterpretations[overallLevel]
      ? getRandomElement(overallInterpretations[overallLevel])
      : "No overall interpretation available.";

    // Return the aggregated ratings (with interpretations), users, userInfo, and overall interpretation
    res.status(200).json({ 
      aggregatedRatings: ratingsWithInterpretation, 
      users, 
      userInfo, 
      overallInterpretation 
    });

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
