'use strict';

// libs
require('dotenv').config();
const test = require('ava');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const httpMocks = require('node-mocks-http');
const Promise = require('bluebird');

const Signup = require('../../../app/models/Signup');
const stubs = require('../../utils/stubs');

// setup "x.should.y" assertion style
chai.should();
chai.use(sinonChai);

// module to be tested
const getSignup = require('../../../lib/middleware/signup-get');

// sinon sandbox object
const sandbox = sinon.sandbox.create();

// Stubs
const signupLookupStub = Promise.resolve(stubs.getSignupWithDraft());

// Setup!
test.beforeEach((t) => {
  // setup req, res mocks
  t.context.req = httpMocks.createRequest();
  t.context.res = httpMocks.createResponse();
});

// Cleanup!
test.afterEach((t) => {
  // reset stubs, spies, and mocks
  sandbox.restore();
  t.context = {};
});

test('getSignup should inject signup, draftSubmission into the req object', async (t) => {
  // setup
  const next = sinon.stub();
  const middleware = getSignup();
  const signup = stubs.getSignupWithDraft();
  sandbox.stub(Signup, 'lookupCurrent').returns(signupLookupStub);

  // test
  await middleware(t.context.req, t.context.res, next);
  t.context.req.signup.should.be.eql(signup);
  t.context.req.draftSubmission.should.be.eql(signup.draft_reportback_submission);
  next.should.have.been.called;
});
