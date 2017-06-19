'use strict';

const Chance = require('chance');
const ObjectID = require('mongoose').Types.ObjectId;

const User = require('../../../app/models/User');
const stubs = require('../../utils/stubs');

const chance = new Chance();

module.exports.getValidUser = function getValidUser() {
  return new User({
    _id: new ObjectID(),
    mobile: chance.phone({ formatted: false, country: 'us' }),
    phoenix_id: chance.natural({ min: 555990, max: 555999 }),
    mobilecommons_id: chance.natural({ min: 555890, max: 555899 }),
    email: chance.email({ domain: 'mobile.import' }),
    role: 'user',
    first_name: chance.first(),
    // Campaign the user is currently participating in via chatbot.
    current_campaign: stubs.getCampaignId(),
  });
};
