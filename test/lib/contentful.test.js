'use strict';

// libs
require('dotenv').config();
const Promise = require('bluebird');
const test = require('ava');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const logger = require('winston');
const rewire = require('rewire');
const underscore = require('underscore');
const expect = require('chai').expect;

// app modules
const stubs = require('../../test/utils/stubs');
const stathat = require('../../lib/stathat');
const contentfulAPI = require('contentful');
const helpers = require('../../lib/helpers');

// setup "x.should.y" assertion style
chai.should();
chai.use(sinonChai);

// module to be tested
const contentful = rewire('../../lib/contentful');

// sinon sandbox object
const sandbox = sinon.sandbox.create();

// Stubs
const emptyStub = Promise.resolve(stubs.contentful.getEntries('empty'));
const allKeywordsStub = Promise.resolve(stubs.contentful.getEntries('keywords'));
const keywordStub = Promise.resolve(stubs.contentful.getEntries('keyword'));
const broadcastStub = Promise.resolve(stubs.contentful.getEntries('broadcast'));
const campaignStub = Promise.resolve(stubs.contentful.getEntries('campaign'));
const defaultCampaignStub = Promise.resolve(stubs.contentful.getEntries('default-campaign'));
const campaignWithOverridesStub = Promise.resolve(stubs.contentful.getEntries('campaign-with-overrides'));
const failStub = Promise.reject({ status: 500 });
const contentfulAPIStub = {
  getEntries: () => {},
};

// Setup!
test.beforeEach(() => {
  stubs.stubLogger(sandbox, logger);
  sandbox.stub(stathat, 'postStat');
  sandbox.stub(contentfulAPI, 'createClient')
    .returns(contentfulAPIStub);
});

// Cleanup!
test.afterEach((t) => {
  // reset stubs, spies, and mocks
  sandbox.restore();
  t.context = {};

  // reset client state on each test
  contentful.__set__('client', undefined);
});

// createNewClient
test('createNewClient should create a new contentful client by calling contentful.createClient',
() => {
  contentful.createNewClient();
  contentfulAPI.createClient.should.have.been.called;
  contentful.getClient().should.respondTo('getEntries');
});

// getClient
test('getClient should return the existing contentful client if already created', () => {
  // setup
  const newClient = contentful.getClient();
  const sameClient = contentful.getClient();

  // test
  contentfulAPI.createClient.should.have.been.calledOnce;
  newClient.should.be.equal(sameClient);
});

// contentfulError
test('contentfulError should add the Contentful error prefix to the error object passed', () => {
  const prefix = contentful.__get__('ERROR_PREFIX');
  const errorObj = { message: 'tacos' };
  const error = contentful.contentfulError(errorObj);
  error.message.should.have.string(prefix);
});

// fetchSingleEntry
test('fetchSingleEntry should only get one item from the entries returned by contentful',
async () => {
  // setup
  sandbox.spy(underscore, 'first');

  // fetchSingleEntry calls getEntries so we stub it here using rewire's __set__
  contentful.__set__('client', {
    getEntries: sinon.stub().returns(allKeywordsStub),
  });

  // test
  const entry = await contentful.fetchSingleEntry();
  underscore.first.should.have.been.called;
  entry.should.be.an('object');
  entry.should.not.be.an('array');
});

test('fetchSingleEntry should reject with a contentfulError if unsuccessful', async () => {
  // setup
  sandbox.spy(contentful, 'contentfulError');
  contentful.__set__('client', {
    getEntries: sinon.stub().returns(failStub),
  });

  // test
  try {
    await contentful.fetchSingleEntry();
  } catch (error) {
    error.status.should.be.equal(500);
  }
  contentful.contentfulError.should.have.been.called;
});

// fetchBroadcast
test('fetchBroadcast should send contentful a query with content_type of broadcast', async () => {
  // setup
  sandbox.stub(contentful, 'fetchSingleEntry').returns(broadcastStub);
  const broadcastId = stubs.getBroadcastId();
  const query = contentful.getQueryBuilder().contentType('broadcast').broadcastId(broadcastId).build();

  // test
  await contentful.fetchBroadcast(broadcastId);
  contentful.fetchSingleEntry.getCall(0).args[0].should.be.eql(query);
});

// fetchCampaign
test('fetchCampaign should send contentful a query with content_type of campaign', async () => {
  // setup
  sandbox.stub(contentful, 'fetchSingleEntry').returns(campaignStub);
  const campaignId = stubs.getCampaignId();
  const query = contentful.getQueryBuilder().contentType('campaign').campaignId(campaignId).build();

  // test
  await contentful.fetchCampaign(campaignId);
  contentful.fetchSingleEntry.getCall(0).args[0].should.be.eql(query);
});

// fetchKeyword
test('fetchKeyword should send contentful a query with content_type of keyword', async () => {
  // setup
  sandbox.stub(contentful, 'fetchSingleEntry').returns(keywordStub);
  const keyword = stubs.getKeyword();
  const query = contentful.getQueryBuilder().contentType('keyword').keyword(keyword).build();

  // test
  await contentful.fetchKeyword(keyword);
  contentful.fetchSingleEntry.getCall(0).args[0].should.be.eql(query);
});

// fetchKeywords
test('fetchKeywords should send contentful a query with content_type of keyword and current env', async () => {
  // setup
  contentful.__set__('client', {
    getEntries: sinon.stub().returns(allKeywordsStub),
  });
  const env = stubs.getEnvironment();
  const query = contentful.getQueryBuilder().contentType('keyword').environment(env).build();

  // test
  await contentful.fetchKeywords();
  contentful.getClient().getEntries.getCall(0).args[0].should.be.eql(query);
});

test('fetchKeywords should call contentfulError when it fails', async () => {
  // setup
  sandbox.spy(contentful, 'contentfulError');
  contentful.__set__('client', {
    getEntries: sinon.stub().returns(failStub),
  });

  // test
  await contentful.fetchKeywords();
  contentful.contentfulError.should.have.been.called;
});

// fetchMessageForCampaignId
test('fetchMessageForCampaignId returns undefined if campaign has no override for this message type',
async () => {
  // setup
  sandbox.spy(contentful, 'fetchCampaign');
  // I am stubbing the getEntries method instead of the fetchCampaign, because I am relying on
  // fetchCampign to only sent me the actual campaign object from the contentful response
  contentful.__set__('client', {
    getEntries: sinon.stub().returns(campaignStub),
  });

  // test
  // TODO: Find a way to not hard code the message type here
  const message = await contentful.fetchMessageForCampaignId(stubs.getCampaignId(), 'gambitSignupMenu');
  expect(message).to.be.undefined;
});

test('fetchMessageForCampaignId should throw if no campaignField matches with message type', async (t) => {
  // TODO: Find a way to not hard code the message type here
  await t.throws(() => contentful.fetchMessageForCampaignId(stubs.getCampaignId(), 'fakeTypeThatDoesntExist'));
});

test('fetchMessageForCampaignId should return null when no campaign is returned by contentful', async () => {
  // setup
  sandbox.spy(contentful, 'fetchCampaign');
  contentful.__set__('client', {
    getEntries: sinon.stub().returns(emptyStub),
  });

  // test
  // TODO: Find a way to not hard code the message type here
  const message = await contentful.fetchMessageForCampaignId(stubs.getCampaignId(), 'gambitSignupMenu');
  expect(message).to.be.null;
});

test('fetchMessageForCampaignId should return error when it fails', async () => {
  // setup
  sandbox.spy(contentful, 'contentfulError');
  sandbox.stub(contentful, 'fetchCampaign').returns(failStub);

  // test
  // TODO: Find a way to not hard code the message type here
  const error = await contentful.fetchMessageForCampaignId(stubs.getCampaignId(), 'gambitSignupMenu');
  error.status.should.be.equal(500);
});

// renderMessageForPhoenixCampaign
test('renderMessageForPhoenixCampaign should return rendered override message', async () => {
  // setup
  const campaign = stubs.getPhoenixCampaign();
  sandbox.spy(contentful, 'fetchMessageForCampaignId');
  contentful.__set__('client', {
    getEntries: sinon.stub().returns(campaignWithOverridesStub),
  });
  // test
  const msg = await contentful.renderMessageForPhoenixCampaign(campaign, 'gambitSignupMenu');
  contentful.fetchMessageForCampaignId.should.have.been.calledOnce;
  msg.should.not.be.empty;
});

test('renderMessageForPhoenixCampaign should return default message if there is no override for message type', async () => {
  // setup
  const campaign = stubs.getPhoenixCampaign();
  sandbox.spy(contentful, 'fetchMessageForCampaignId');
  sandbox.spy(helpers, 'replacePhoenixCampaignVars');
  const stub = sinon.stub();
  // return a campaign with no overrides
  stub.onCall(0).returns(campaignStub);
  // return the default campaign in contentful wich has all default overrides
  stub.onCall(1).returns(defaultCampaignStub);
  contentful.__set__('client', {
    getEntries: stub,
  });
  // test
  const msg = await contentful.renderMessageForPhoenixCampaign(campaign, 'gambitSignupMenu');
  contentful.fetchMessageForCampaignId.should.have.been.calledTwice;
  helpers.replacePhoenixCampaignVars.should.have.been.calledOnce;
  msg.should.not.be.empty;
});

test('renderMessageForPhoenixCampaign should return error if the campaign field is valid but it doesnt have a default message',
async () => {
  // setup
  const campaign = stubs.getPhoenixCampaign();
  sandbox.spy(contentful, 'fetchMessageForCampaignId');
  const stub = sinon.stub();
  // return a campaign with no overrides
  stub.onCall(0).returns(campaignStub);
  // return the default campaign in contentful wich has all default overrides
  stub.onCall(1).returns(defaultCampaignStub);
  contentful.__set__('client', {
    getEntries: stub,
  });
  // test
  try {
    await contentful.renderMessageForPhoenixCampaign(campaign, 'scheduled_relative_to_reportback_date');
  } catch (error) {
    error.status.should.be.equal(422);
  }
  contentful.fetchMessageForCampaignId.should.have.been.calledTwice;
});

test('renderMessageForPhoenixCampaign should return error fetchMessageForCampaignId fails',
async () => {
  // setup
  const campaign = stubs.getPhoenixCampaign();
  sandbox.stub(contentful, 'fetchMessageForCampaignId').returns(failStub);
  // test
  try {
    await contentful.renderMessageForPhoenixCampaign(campaign, 'gambitSignupMenu');
  } catch (error) {
    error.status.should.be.equal(500);
  }
  contentful.fetchMessageForCampaignId.should.have.been.calledOnce;
});


// fetchDefaultAndOverrideContentfulCampaignsForCampaignId
test('fetchDefaultAndOverrideContentfulCampaignsForCampaignId should return object with default and override properties', async () => {
  // setup
  sandbox.spy(contentful, 'fetchCampaigns');
  const stub = sinon.stub();
  stub.onCall(0).returns(campaignStub);
  contentful.__set__('client', {
    getEntries: stub,
  });

  // test
  const campaignId = stubs.getCampaignId();
  const res = await contentful.fetchDefaultAndOverrideContentfulCampaignsForCampaignId(campaignId);
  contentful.fetchCampaigns.should.have.been.called;
  res.should.include.keys(['default', 'override']);
});


test('fetchDefaultAndOverrideContentfulCampaignsForCampaignId should throw when fetchCampaign fails', async () => {
  // setup
  sandbox.stub(contentful, 'fetchCampaigns').returns(failStub);

  // test
  try {
    await contentful.fetchDefaultAndOverrideContentfulCampaignsForCampaignId(stubs.getCampaignId());
  } catch (error) {
    error.status.should.be.equal(500);
  }
});


test('getFieldNameForCampaignMessageTemplate should return a config.campaignFields value', (t) => {
  // setup
  const contentfulConfig = require('../../config/lib/contentful');
  const template = 'askPhotoMessage';
  const fieldName = contentfulConfig.campaignFields[template];

  // test
  const result = contentful.getFieldNameForCampaignMessageTemplate(template);
  t.deepEqual(result, fieldName);
});
