const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const validator = require('validator')

const Schema = mongoose.Schema

const userSchema = new Schema ({
    email: {
        type: String,
        required: true,
        unique: true
    },
    password:{
        type: String,
        required: true
    },
    firstName:{
        type: String,
        required: true
    },
    lastName:{
        type: String,
        required: true
    },
    role:{
        type: String,
        required: true
    },
    teacherId: {
        type: String,
        default: ''
    },
    department: {
        type: String,
        default: ''
    },
    staffType: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'deactivated'],
        default: 'active',
        required: true
    },
    deactivatedAt: {
        type: Date,
        default: null
    },
    devices: {
        type: [String],
        default: []
    }
}, {
    timestamps: true
})

// static signup method
userSchema.statics.signup = async function (email, password, firstName, lastName, role, extra = {}) {

    if (!email || !password || !firstName || !lastName || !role){
        throw Error ('All fields must be filled')
    }

    if (!validator.isEmail(email)) {
        throw Error('Email is not valid')
    }

    if (!validator.isStrongPassword(password)){
        throw Error('Password not strong enough')
    }

    const exists = await this.findOne({ email })

    if (exists) {
        throw Error('Email already in use')
    }

    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)

    const { teacherId = '', department = '', staffType = '', status = 'active' } = extra

    const user = await this.create({email, password: hash, firstName, lastName, role, teacherId, department, staffType, status})

    return user
}

// static login method
userSchema.statics.login = async function(email, password){

    if (!email || !password ){
        throw Error ('All fields must be filled')
    }

    const user = await this.findOne({ email })

    if (!user) {
        throw Error('Incorrect email')
    }

    if (user.status === 'deactivated') {
        throw Error('Account has been deactivated. Please contact support.')
    }

    if (user.status === 'pending') {
        throw Error('Your account is pending admin approval.')
    }

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
        throw Error('Incorrect password')
    }

    return user 
}

module.exports = mongoose.model('User', userSchema)