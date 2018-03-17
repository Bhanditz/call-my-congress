import { isNone } from '@ember/utils';
import { inject as service } from '@ember/service';
import Component from '@ember/component';
import $ from 'jquery';

export default Component.extend({
  message: service(),
  lookupData: service(),

  isLoading: false,

  lookupDistrict() {
    const street = this.get('lookupData.street');
    const zip = this.get('lookupData.zip');

    let url;

    if (street) {
      const encodedStreet = encodeURI(street);
      url = `/api/district-from-address?street=${encodedStreet}&zip=${zip}`;
    } else {
      url = `/api/district-from-address?zip=${zip}`;
    }

    this.set('isLoading', true);

    return $.getJSON(url)
      .then(result => {
        this.set('isLoading', false);
        if (result.districts) {
          if (result.districts.length === 1) {
            this.get('router').transitionTo('district', result.districts[0].id);
            return;
          } else if (result.districts.length > 1) {
            this.set('lookupData.districtsToPickFrom', result.districts);
            return;
          }
        }

        this.get('message').display('errors.general');
      })
      .catch(error => {
        this.set('isLoading', false);
        this.get('message').displayFromServer(error);
      });
  },

  submit(event) {
    event.preventDefault();
    this.get('message').clear();

    if (isNone(this.get('lookupData.zip'))) {
      this.get('message').display('errors.server.MISSING_ZIP');
      return;
    }

    this.lookupDistrict();
  }
});
