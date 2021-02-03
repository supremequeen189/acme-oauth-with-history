const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = require('./secrets');
process.env.GITHUB_CLIENT_ID = GITHUB_CLIENT_ID;
process.env.GITHUB_CLIENT_SECRET = GITHUB_CLIENT_SECRET;

const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Sequelize = require('sequelize');
const { STRING, INTEGER } = Sequelize;
const config = {
  logging: false
};

if(process.env.LOGGING){
  delete config.logging;
}
const conn = new Sequelize(process.env.DATABASE_URL || 'postgres://localhost/acme_db', config);

const User = conn.define('user', {
  username: STRING,
  githubId: INTEGER
});

const UserLogin = conn.define('userlogin', {
    githubId: INTEGER,
    login_date_time: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
    }
  });

UserLogin.belongsTo(User);

User.byToken = async(token)=> {
  try {
    const { id } = await jwt.verify(token, process.env.JWT);
    const user = await User.findByPk(id);
    if(user){
      return user;
    }
    throw 'noooo';
  }
  catch(ex){
    const error = Error('bad credentials');
    error.status = 401;
    throw error;
  }
};

// documentation - https://docs.github.com/en/developers/apps/authorizing-oauth-apps

// useful urls
const GITHUB_CODE_FOR_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_ACCESS_TOKEN_FOR_USER_URL = 'https://api.github.com/user';

//the authenticate methods is passed a code which has been sent by github
//if successful it will return a token which identifies a user in this app
User.authenticate = async(code)=> {
    try {
         //exchanges code for access token
        let response = await axios.post('https://github.com/login/oauth/access_token', {
            code: code,
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET
        }, {
            headers: {
                accept: 'application/json'
            }
        });
        const data = response.data;
        if (data.error) {
            const error = Error(data.error);
            error.status = 401;
            throw error;
        }

        //get user info w/ the access token
        response = await axios.get('https://api.github.com/user', {
            headers: {
                authorization: `token ${ data.access_token }`
            }
        });
        const { login, id, ...other } = response.data;
        let user = await User.findOne({ 
            where: {
                username: login,
                githubId: id,
            }
        });
        if(!user) {
            user = User.create({ 
                username: login, 
                githubId: id, 
            }); 
        }

        //create our own token with the user id
        const jwtToken = jwt.sign({ id: user.id }, process.env.JWT);

        UserLogin.create({
            githubId: id, 
        });
        //return signed token which contains the id of the user in the app
        return jwtToken;
    }
    catch(ex) {
        const error = Error('bad credentials');
        error.status = 401;
        throw error;
    }

};

const syncAndSeed = async()=> {
  await conn.sync({ force: false });
};

module.exports = {
  syncAndSeed,
  models: {
    User,
    UserLogin
  }
};
