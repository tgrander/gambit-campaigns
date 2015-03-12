/**
 * Submit report backs to the Drupal backend via SMS.
 */

var express = require('express')
  , router = express.Router()
  , connectionOperations = rootRequire('app/config/connectionOperations')
  , model = require('./reportbackModel')(connectionOperations)
  , mobilecommons = rootRequire('mobilecommons')
  , emitter = rootRequire('app/eventEmitter')
  , logger = rootRequire('app/lib/logger')
  , dscontentapi = rootRequire('app/lib/ds-content-api')();
  ;

router.post('/:campaign', function(request, response) {
  var campaign
    , campaignConfig
    , phone
    , requestData
    , i
    ;
  
  // Check that we have a config setup for this campaign
  campaign = request.params.campaign;
  campaignConfig = app.getConfig(app.ConfigName.REPORTBACK, campaign, 'endpoint');

  if (typeof campaignConfig !== 'undefined') {
    phone = request.body.phone;
    
    // Find document for this user 
    findDocument(phone, campaignConfig.endpoint)
      .then(function(doc) {
          return onDocumentFound(doc, phone, campaignConfig);
        }, function(err) {
          logger.error('Error from reportback.findDocument:', err);
        })
      .then(function(doc) {
          requestData = {
            campaignConfig: campaignConfig,
            phone: phone,
            args: request.body.args,
            mms_image_url: request.body.mms_image_url,
            profile_first_completed_campaign_id: request.body.profile_first_completed_campaign_id
          };
          handleUserResponse(doc, requestData);
        }, function(err) {
          logger.error('Error from reportback.onDocumentFound:', err);
        });

    response.send();
  }
  else {
    response.status(404).send('Request not available for ' + request.params.campaign);
  }
});

module.exports = router;

/**
 * Find the current report back document for a user.
 *
 * @param phone
 *   Phone number of user
 * @param endpoint
 *   Campaign endpoint identifier
 */
function findDocument(phone, endpoint) {
  return model.findOne({'phone': phone, 'campaign': endpoint}).exec();
}

/**
 * Called when findDocument is complete.
 *
 * @param doc
 *   Document found, if any
 * @param phone
 *   Phone number of user
 * @param campaignConfig
 *   Campaign config
 */
function onDocumentFound(doc, phone, campaignConfig) {
  if (doc) {
    return doc;
  }
  else {
    // Create a document if none was found
    return model.create({'phone': phone, 'campaign': campaignConfig.endpoint});
  }
}

/**
 * Determine what data we just received from the user based on the state of the
 * user's report back document.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function handleUserResponse(doc, data) {
  if (!doc.photo) {
    receivePhoto(doc, data);
  }
  else if (!doc.caption) {
    receiveCaption(doc, data);
  }
  else if (!doc.quantity) {
    receiveQuantity(doc, data);
  }
  else if (!doc.why_important) {
    receiveWhyImportant(doc, data);
  }
}

/**
 * Process request for user who has sent a photo.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function receivePhoto(doc, data) {
  var photoUrl = data.mms_image_url;
  if (!photoUrl) {
    mobilecommons.profile_update(data.phone, data.campaignConfig.message_not_a_photo);
  }
  else {
    model.update(
      {phone: data.phone},
      {'$set': {photo: photoUrl}},
      function(err, num, raw) {
        if (!err) {
          emitter.emit(emitter.events.reportbackModelUpdate);
        }
      });

    mobilecommons.profile_update(data.phone, data.campaignConfig.message_caption);
  }
}

/**
 * Process request for user who is sending the caption for the photo.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function receiveCaption(doc, data) {
  var answer = data.args;
  model.update(
    {phone: data.phone},
    {'$set': {caption: answer}},
    function(err, num, raw) {
      if (!err) {
        emitter.emit(emitter.events.reportbackModelUpdate);
      }
    });

  mobilecommons.profile_update(data.phone, data.campaignConfig.message_quantity);
}

/**
 * Process request for user who is answering with a quantity.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function receiveQuantity(doc, data) {
  var answer = data.args;
  model.update(
    {phone: data.phone},
    {'$set': {quantity: answer}},
    function(err, num, raw) {
      if (!err) {
        emitter.emit(emitter.events.reportbackModelUpdate);
      }
    });

  mobilecommons.profile_update(data.phone, data.campaignConfig.message_why);
}

/**
 * Process request for user who is answering why this is important.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function receiveWhyImportant(doc, data) {
  var answer = data.args;
  model.update(
    {phone: data.phone},
    {'$set': {why_important: answer}},
    function(err, num, raw) {
      if (!err) {
        emitter.emit(emitter.events.reportbackModelUpdate);
      }
    });

  doc.why_important = answer;
  completeReportBack(doc, data);
}

/**
 * Complete the report back flow.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function completeReportBack(doc, data) {
  var customFields = {};

  // Start report back submission requests by first finding the user
  findUserUidThenReportBack(doc, data);

  // If this is the first campaign a user's completed, save it
  if (data.profile_first_completed_campaign_id) {
    customFields.profile_first_completed_campaign_id = data.campaignConfig.campaign_completed_id;
  }

  // Send message to user that their report back is complete
  mobilecommons.profile_update(data.phone, data.campaignConfig.message_complete, customFields);

  // Opt user out of campaign, if specified
  if (data.campaignConfig.campaign_optout_id) {
    mobilecommons.optout({
      phone: data.phone,
      campaignId: data.campaignConfig.campaign_optout_id
    });
  }
}

/**
 * Find the user's UID based on the phone number. Submit the report back if a user
 * is found. Otherwise, create a user first then submit the report back.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function findUserUidThenReportBack(doc, data) {
  var phone;
  var userData;
  var context;

  // Remove the international code (users typically don't include it when entering their number)
  if (data.phone.length == 11) {
    phone = data.phone.substr(1);
  }

  userData = {
    mobile: phone
  };

  context = {
    data: data,
    doc: doc,
    isInitialSearch: true
  };

  dscontentapi.userGet(userData, onFindUserUid.bind(context));
}

function onFindUserUid(err, response, body) {
  var context;

  // Variables bound to the callback
  var data = this.data;
  var doc = this.doc;
  var isInitialSearch = this.isInitialSearch;

  var jsonBody = JSON.parse(body);
  if (jsonBody.length == 0) {
    // If the initial search couldn't find the user, search again with country code.
    if (isInitialSearch) {
      userData = {
        mobile: data.phone
      };

      context = {
        data: data,
        doc: doc,
        isInitialSearch: false,
      };

      dscontentapi.userGet(userData, onFindUserUid.bind(context));
    }
    // If we still can't find the user, create an account and then submit report back.
    else {
      createUserThenReportBack(doc, data);
    }
  }
  else {
    // User account found. Submit the report back.
    submitReportBack(jsonBody[0].uid, doc, data);
  }
}

/**
 * Create a user account and then submit report back for the new user.
 *
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function createUserThenReportBack(doc, data) {
  var phone;
  var userData;

  // Strip the international code for user registration data
  if (data.phone.length == 11) {
    phone = data.phone.substr(1);
  }

  userData = {
    email: phone + '@mobile',
    mobile: phone,
    user_registration_source: process.env.DS_CONTENT_API_USER_REGISTRATION_SOURCE
  };

  // Create user account
  dscontentapi.userCreate(userData, function(err, response, body) {
    // Then submit report back with the newly created UID
    if (body && body.uid) {
      logger.info('Successfully created a user for: ' + phone);
      submitReportBack(body.uid, doc, data);
    }
    else {
      logger.error('Unable to create a user for: ' + phone);
    }
  });
}

/**
 * Submit a report back.
 *
 * @param uid
 *   User ID
 * @param doc
 *   User's report back document
 * @param data
 *   Data from the user's request
 */
function submitReportBack(uid, doc, data) {
  var rbData = {
    nid: data.campaignConfig.campaign_nid,
    uid: uid,
    caption: doc.caption,
    quantity: doc.quantity,
    why_participated: doc.why_important,
    file_url: doc.photo
  };

  dscontentapi.campaignsReportback(rbData, function(err, response, body) {
    if (err) {
      logger.error(err);
    }
    else if (body && body.length > 0) {
      if (body[0] == false) {
        logger.error('Error when submitting report back.', response);
      }
      else {
        logger.info('Successfully submitted report back. rbid: ' + body[0]);

        // Remove the report back doc when complete
        model.remove({phone: data.phone, campaign: data.campaignConfig.endpoint}).exec();
      }
    }
  });
}



/**
 *
 * Exposing private functions for tests.
 *
 */
if (process.env.NODE_ENV === 'test') {
  module.exports.findDocument = findDocument;
  module.exports.onDocumentFound = onDocumentFound;
  module.exports.handleUserResponse = handleUserResponse;
  module.exports.receiveCaption = receiveCaption;
  module.exports.receivePhoto = receivePhoto;
  module.exports.receiveQuantity = receiveQuantity;
  module.exports.receiveWhyImportant = receiveWhyImportant;
  module.exports.completeReportBack = completeReportBack;
}
