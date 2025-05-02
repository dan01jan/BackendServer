// const expressjwt = require('express-jwt');
const { expressjwt: jwt } = require("express-jwt");
function authJwt() {
    const secret = process.env.secret;
    const api = process.env.API_URL;
    return jwt({
        secret,
        algorithms: ['HS256'],
        // isRevoked: isRevoked
    }) 
        .unless({
            path: [
                { url: "/", methods: ['GET','POST', 'PUT', 'OPTIONS', 'DELETE'] }, 
                {
                    url: /\/api\/v1\/events(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/questionnaires(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/ratings(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/attendance(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/traits(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/questions(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/responses(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/types(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/posts(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS']
                },
                {
                    url: /\/api\/v1\/organizations(.*)/,
                    methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS', 'PATCH']
                },
                { url: /\/public\/uploads(.*)/, methods: ['GET']},
                {
                    url: new RegExp(`${api}/users/organizations/officers/[a-fA-F0-9]{24}/(approve|decline)`),
                    methods: ['PUT']
                  },
                
                // {
                //     url: new RegExp(`${api}/users/organizations/officers/[a-fA-F0-9]{24}/approve`),
                //     methods: ['PUT']
                // },

                `${api}/users`,
                `${api}/users/login`,
                `${api}/users/weblogin`,
                `${api}/users/email/:email`,
                `${api}/users/register`,
                `${api}/users/update/:id`, 
                `${api}/users/:id`,
                `${api}/users/verify-otp`,
                `${api}/users/resend-otp`,
                `${api}/users/organizations/officers`,
                `${api}/users/organization/:id/count`,
                `${api}/users/organization/:id/officers/count`,
                `${api}/organizations/eligible-officers/organizationId`,
                `${api}/organizations/:id/events`,
                //`${api}/users/organizations/officers/:userId/approve`,
                //`${api}/users/organizations/officers/:userId/approve`
            ]
        })
}

async function isRevoked(req, payload, done) {
    if (!payload.isOfficer) {
        done(null, true)
    }
    done();
}
  
 
 
module.exports = authJwt