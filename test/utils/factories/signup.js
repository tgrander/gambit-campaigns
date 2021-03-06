'use strict';

const Chance = require('chance');
const ObjectID = require('mongoose').Types.ObjectId;

const Signup = require('../../../app/models/Signup');
const stubs = require('../../utils/stubs');

const chance = new Chance();

module.exports.getValidSignup = function getValidSignup() {
  return new Signup({
    _id: chance.natural({ min: 555890, max: 555899 }),
    user: new ObjectID(),
    campaign: stubs.getCampaignId(),
    keyword: stubs.getKeyword(),
    draft_reportback_submission: null,
    reportback: chance.natural({ min: 555990, max: 555999 }),
    total_quantity_submitted: chance.integer({ min: 1, max: 10 }),
    broadcast_id: null,
  });
};
