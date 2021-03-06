var crypto = require('crypto');
var multer = require('multer');
var User = require('../models/user');
var config = require('../../config');

module.exports = {

    /**
     * Gets a user from the login token
     * @param token
     * @returns {*|ChildProcess|Array|{index: number, input: string}|Promise}
     */
    getUserByToken: function(token) {
        return User.findOne({ token: token }).exec();
    },


    /**
     * Logs a user out by invalidating the token
     * @param userId
     * @returns {MPromise<User>}
     */
    logout: function(userId) {
        return User
                .findOne({ _id: userId })
                .exec()
                .then(function(user) {
                    user.token = null;
                    return user.save();
                });
    },

    /**
     * Logs a user in by generating a new token
     * @param email
     * @param password
     * @returns {MPromise<User>}
     */
    login: function(email, password) {
        return User
            .findOne({ email: email })
            .exec()
            .then(function(aUser){
                if(!aUser) {
                    throw({status: 422, message: "User doesn't exist"});
                }
                else {
                    if(aUser.comparePassword(password)){

                        aUser.setToken();
                        return aUser.save();
                    }
                    else {
                        throw({status: 401, message: "Incorrect credentials"});
                    }
                }
            });
    },

    /**
     * Logs a user in using an old token and generates a new token for future use
     * @param token
     * @returns {MPromise}
     */
    tokenLogin: function(token) {
        console.log(token);
        return User
            .findOne({ token: token })
            .exec()
            .then(function(aUser){
                if(!aUser) {
                    throw({status: 401, message: "Cannot log in with incorrect token"});
                }
                if(aUser.isTokenExpired()) {
                    throw({status: 401, message: "Login token has expired"});
                }
                // new token with new expiry
                aUser.setToken();
                return aUser.save();
            });
    },

    /**
     * Creates a new user
     * @param email
     * @param password
     * @returns {MPromise<User>}
     */
    create: function(email, password) {
        return User.findOne({ email: email })
                .select('id')
                .exec()
                .then(function(aUser){
                    if(aUser){
                        throw({status: 422, message: "User already exists"});
                    } else {

                        var passwordHash = crypto.createHash('sha256').update(password).digest('hex');

                        var newUser = new User({
                            email: email,
                            password: passwordHash,
                            avatar: {
                                url: null
                            }
                        });

                        newUser.setToken();

                        return newUser.save().then(function(createdUser){
                            // hide password
                            createdUser.password = null;
                            return createdUser;
                        });

                    }
                });
    },

    /**
     * Updates a user with only fields that have been passed in the user object
     * @param user
     * @returns {MPromise}
     */
    update: function(user) {

        return User
            .findOne({ _id: user._id })
            .exec()
            .then(function(aUser){
                if(aUser){
                    var query = { _id: user._id };
                    var updateFields = aUser.updateFields(user);
                    var options = {new: true};
                    return User.findOneAndUpdate(query, updateFields, options).exec();
                }
                else {
                    throw({status: 422, message: "User doesn't exist"});
                }
            });
    },

    /**
     * Updates the user's password
     * @param user
     * @param currentPassword
     * @param newPassword
     * @returns {MPromise}
     */
    updatePassword: function(user, currentPassword, newPassword) {
        return User
            .findOne({ _id: user._id })
            .exec()
            .then(function(aUser){
                if(aUser.comparePassword(currentPassword)){
                    aUser.password = crypto.createHash('sha256').update(newPassword).digest('hex');
                    return aUser.save();
                }
                else {
                    throw({status: 422, message: "Password is incorrect"});
                }
            });
    },


    /**
     * Updates the user's password using a token for validation
     * @param token
     * @param email
     * @param newPassword
     * @returns {Function|*|U}
     */
    resetPassword: function(token, email, newPassword) {
        return new Promise(function(resolve, reject) {
            User
                .findOne({email: email})
                .exec()
                .then(function (aUser) {
                    if(!aUser){
                        reject({status: 422, message: "The email you entered does not exist in the system"});
                    }
                    if (aUser.validateResetPasswordToken(token)) {
                        aUser.password = crypto.createHash('sha256').update(newPassword).digest('hex');
                        aUser.save();
                        resolve({message: "Your password has been reset"});
                    }
                    else {
                        reject({status: 422, message: "Reset token is invalid"});
                    }
                })
                .catch(function(error){
                    reject(error);
                });
        });
    },

    /**
     * Sends an email with a reset password token
     * @param enteredEmail
     * @returns {Function|*|U}
     */
    forgotPassword: function(enteredEmail) {
        return new Promise(function(resolve, reject){
            User
                .findOne({ email: enteredEmail })
                .exec()
                .then(function(aUser){
                    if(aUser){
                        var token = aUser.generateResetPasswordToken();
                        aUser.save();

                        //TODO: Send email, remove token from message below
                        resolve({message: "An email has been sent with a reset link to your email address."+token});

                    }
                    else {
                        reject({status: 422, message: "The email you entered does not exist in the system"});
                    }
                })
                .catch(function(error){
                    reject(error);
                });
        });
    },

    /**
     * Updates the user's image
     * @param req
     * @param res
     * @returns {Function|*|U}
     */
    updateAvatar: function(req, res) {

        var fileName = null;
            var storage = multer.diskStorage({ //multers disk storage settings
                destination: function (req, file, cb) {
                    cb(null, config.imagePath);
                },
                filename: function (req, file, cb) {
                    fileName = req._user._id + '.' + file.originalname.split('.')[file.originalname.split('.').length -1];
                    cb(null, req._user._id + '.' + file.originalname.split('.')[file.originalname.split('.').length -1]);
                }
            });

            var upload = multer({ //multer settings
                storage: storage
            }).single('avatar');

            return new Promise(function(resolve, reject)
            {
                upload(req, res, function (err) {
                    if (err) {
                        reject(err);
                    }

                    User
                        .findOne({_id: req._user._id})
                        .exec()
                        .then(function (aUser) {
                            if (aUser) {
                                aUser.avatar.url = config.host + ':' + config.port + config.imageWebPath + fileName;
                                var u = aUser.save();
                                resolve(u);
                            }
                            else {
                                reject("Can't find user");
                            }
                        });

                });
            });

    }
};