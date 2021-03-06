/* eslint-env node */
/* global Promise */

const express = require('express');
const log = require('log');

const { AppError, buildURL, performGETRequest } = require('./utils');
const { fetchAllRepresentatives, fetchAllSenators, fetchDistrictsForZip } = require('./api-cache');

const app = express();

const DEFAULT_PORT = 3000;

const AT_LARGE_DISTRICT_NAME = '(at Large)';
const AT_LARGE_DISTRICT_NUMBER = 0;

const GEOGRAPHY_BASE_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address';

// Geography layer that includes information on the most recent congressional districts
// as defined: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/54
const CONGRESSIONAL_DISTRICTS_LAYER = 54;

function getPartyName(shorthand) {
  switch(shorthand) {
    case 'D': return 'Democrat';
    case 'R': return 'Republican';
    default: return shorthand;
  }
}

function getDistricts(geography) {
  // Be careful not to log actual street here, to protect privacy of users
  log.info(`[app] getDistricts, zip=${geography.zip}`);

  const params = {
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
    layers: CONGRESSIONAL_DISTRICTS_LAYER,
    street: geography.street,
    zip: geography.zip
  };

  return performGETRequest({ url: buildURL(GEOGRAPHY_BASE_URL, params) }, result => {
    if (result.result.addressMatches.length === 0) {
      throw new AppError('INVALID_ADDRESS');
    }

    const address = result.result.addressMatches[0];

    const allCongressNames = Object.getOwnPropertyNames(address.geographies).sort();

    const mostRecentCongressName = allCongressNames.slice(-1);
    const mostRecentCongress = address.geographies[mostRecentCongressName];

    let number = mostRecentCongress[0].BASENAME;
    const state = address.addressComponents.state;

    if (state && number.match(AT_LARGE_DISTRICT_NAME)) {
      number = AT_LARGE_DISTRICT_NUMBER;
    } else {
      number = Number(number);
    }

    const id = `${state}-${number}`;

    return {
      districts: [
        { number, state, id }
      ]
    };
  });
}

function getDistrictsZipOnly(geography) {
  log.info(`[app] getDistrictsZipOnly, zip=${geography.zip}`);

  return fetchDistrictsForZip(geography.zip).then(districts => {
    if (districts === null) {
      throw new AppError('INVALID_ADDRESS');
    }

    return { districts };
  }, false);
}

function getRepresentatives(district) {
  const districtIsAtLarge = district.number === AT_LARGE_DISTRICT_NUMBER;

  return fetchAllRepresentatives().then(allMembers => {
    const repsForDistrict = allMembers.filter(member => {
      return member.state === district.state && (districtIsAtLarge || Number(member.district) === district.number);
    });

    const representatives = repsForDistrict.map(representative => {
      const data = {
        title: 'Rep.',
        person: {
          firstname: representative.first_name,
          lastname: representative.last_name,
        },
        party: getPartyName(representative.party),
        phone: representative.phone,
        twitter: representative.twitter_account,
        govtrack: representative.govtrack_id,
        cspan: representative.cspan_id,
        next_election: representative.next_election
      };

      if (representative.in_office === false || representative.in_office === 'false') {
        data.vacant = true;
      }

      return data;
    });

    return { representatives };
  });
}


function getSenators(district) {
  return fetchAllSenators().then(allMembers => {
    const senatorsForDistrict = allMembers.filter(member => member.state === district.state);

    const senators = senatorsForDistrict.map(senator => {
      const data = {
        title: 'Sen.',
        person: {
          firstname: senator.first_name,
          lastname: senator.last_name,
        },
        party: getPartyName(senator.party),
        phone: senator.phone,
        twitter: senator.twitter_account,
        govtrack: senator.govtrack_id,
        cspan: senator.cspan_id,
        next_election: senator.next_election
      };

      if (senator.in_office === false || senator.in_office === "false") {
        data.vacant = true;
      }

      return data;
    });

    return { senators };
  });
}

function buildCongress(district) {
  log.info(`[app] buildCongress, district=${district.id}`);

  return Promise.all([
    getRepresentatives(district),
    getSenators(district)
  ])
  .then(congress => {
    const representatives = congress[0].representatives;
    const senators = congress[1].senators;

    if (senators.length === 0 && representatives.length === 0) {
      throw new AppError('INVALID_STATE');
    }

    return {
      representatives,
      senators,
      district: {
        districts: [district]
      }
    };
  });
}


app.get('/api/district-from-address', (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (!req.query.zip) {
    res.status(400).send({ translationKey: 'MISSING_ZIP' });
    return;
  }

  const getDistrictsFunction = req.query.street ? getDistricts : getDistrictsZipOnly;

  try {
    getDistrictsFunction(req.query)
      .then(district => res.send(district))
      .catch(err => {
        const translationKey = err instanceof AppError ? err.message : 'UNKNOWN';
        res.status(500).send({ translationKey });
      });
  } catch (err) {
    res.status(500).send({ translationKey: 'UNKNOWN' });
  }
});

app.get('/api/congress-from-district', (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const districtID = req.query.id;

    if (districtID === undefined) {
      res.status(400).send({ translationKey: 'MISSING_DISTRICT_ID'});
      return;
    }

    const stateNumberPattern = /^([a-zA-z]{2})-?([0-9]+)$/;
    const match = districtID.match(stateNumberPattern);

    if (match === null) {
      res.status(400).send({ translationKey: 'INVALID_DISTRICT_ID'});
      return;
    }

    const [, state, rawNumber] = match;
    const number = Number(rawNumber);
    const district = { state, number, id: `${state}-${number}` };

    buildCongress(district)
      .then(congress => res.send(congress))
      .catch(err => {
        const translationKey = err instanceof AppError ? err.message : 'UNKNOWN';
        res.status(500).send({ translationKey });
      });
  } catch (err) {
    res.status(500).send({ translationKey: 'UNKNOWN' });
  }
});

const server = app.listen(process.env.PORT || DEFAULT_PORT, function () {
  const port = server.address().port;
  log.info(`CallMyCongress server listening at port ${port}`);
});

module.exports = server;