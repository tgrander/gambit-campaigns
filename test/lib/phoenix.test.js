'use strict';

require('dotenv').config();

const test = require('ava');
const chai = require('chai');
const sinonChai = require('sinon-chai');
const sinon = require('sinon');
const nock = require('nock');

// app modules
const stubs = require('../../test/utils/stubs');
const config = require('../../config/lib/phoenix');

const baseUri = config.clientOptions.baseUri;
const campaignId = stubs.getCampaignId();

chai.should();
chai.use(sinonChai);
const sandbox = sinon.sandbox.create();

// Module to test
const phoenix = require('../../lib/phoenix');

test.beforeEach(() => {
  sandbox.spy(phoenix, 'parsePhoenixCampaign');
  sandbox.spy(phoenix, 'parsePhoenixError');
});

test.afterEach(() => {
  sandbox.restore();
});

test('phoenix should respond to fetchCampaignById', () => {
  phoenix.should.respondTo('fetchCampaignById');
});

test('phoenix should respond to getCampaignById', () => {
  phoenix.should.respondTo('getCampaignById');
});

test('phoenix should respond to isClosedCampaign', () => {
  phoenix.should.respondTo('isClosedCampaign');
});

test('phoenix.fetchCampaignById should call parsePhoenixCampaign on success', async () => {
  nock(baseUri)
    .get(/$/)
    .reply(200, stubs.phoenix.getCampaign());

  await phoenix.fetchCampaignById(campaignId);
  phoenix.parsePhoenixCampaign.should.have.been.called;
});

test('phoenix.fetchCampaignById should call parsePhoenixError on error', async () => {
  const message = 'Miley';
  const status = 500;
  nock(baseUri)
    .get(/$/)
    .reply(status, { error: { message } });

  try {
    await phoenix.fetchCampaignById(campaignId);
  } catch (error) {
    error.status.should.be.equal(status);
  }
  phoenix.parsePhoenixError.should.have.been.called;
});
