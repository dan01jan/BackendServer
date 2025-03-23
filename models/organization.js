const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    department: {
        type: String,
        required: true
    },
    image: {
        type: String,
        default: ''
    },
    // New field to store the organization category
    category: {
        type: String,
        enum: ['Academic', 'Non Academic', 'Multi-Faith', 'Unknown'],
        default: 'Unknown'
    },
    officers: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: {
            type: String,
            required: false
        },
        image: {
            type: String,
            default: ''
        },
        position: {
            type: String,
            required: false
        }
    }],
});

// Pre-save hook to automatically determine organization category
organizationSchema.pre('save', function(next) {
    // Lists for each category
    const academicList = [
        "Association of Civil Engineering Students of TUP Taguig Campus",
        "Automotive Society of Engineering",
        "Bachelor of Science in Electrical Engineering Guild",
        "Die and Mould Maker Society - TUPTaguig",
        "Electromechanics Society",
        "Green Chemistry Society",
        "Institute of Electronics Engineers of the Philippines - TUPT Student Chapter",
        "Instrumentation and Control Society - TUPT Student Chapter",
        "Junior Philippine Society of Mechanical Engineers",
        "Junior Society of Heating, Refrigeration and Air Conditioning Engineers",
        "Manila Technician Institute Computer Society",
        "Mechanical Technologies and Leader’s Society",
        "Mechatronics and Robotics Society of the Philippines Taguig Student Chapter",
        "Technical Educators Society - TUP Taguig",
        "TUP Taguig Society of Nondestructive Testing"
    ];

    const nonAcademicList = [
        "DOST Scholars Association for Innovation and Technology",
        "Peer Facilitators Group",
        "LANI Scholars of Technology and Engineering Pioneers"
    ];

    const multiFaithList = [
        "Catholic Youth Movement",
        "Christian Brotherhood International",
        "Manila Technician Institute Christian Fellowship",
        "TUPT Positive Lifestyle Under the Son Network",
        "The Jesus Impact - TUP"
    ];

    // Convert organization name to lowercase for case-insensitive comparison
    const orgName = this.name.trim().toLowerCase();

    if (academicList.some(item => item.toLowerCase() === orgName)) {
        this.category = 'Academic';
    } else if (nonAcademicList.some(item => item.toLowerCase() === orgName)) {
        this.category = 'Non Academic';
    } else if (multiFaithList.some(item => item.toLowerCase() === orgName)) {
        this.category = 'Multi-Faith';
    } else {
        this.category = 'Unknown';
    }
    next();
});

module.exports = mongoose.model('Organization', organizationSchema);
