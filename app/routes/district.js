import { inject as service } from '@ember/service';
import Route from '@ember/routing/route';
import $ from 'jquery';

export default Route.extend({
  message: service(),

  model(params) {
    return $.getJSON(`/api/congress-from-district?id=${params.district_id}`)
      .catch(error => this.get('message').displayFromServer(error));
  }
});
