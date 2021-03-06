import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import setupStubs from '../../helpers/setup-stubs';

module('Unit | Service | message', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.stubs = setupStubs([
      {
        name: 'intl',
        methodOverrides: [
          {
            name: 'exists',
            override: () => this.isKeyDefined
          }
        ]
      }
    ]);

    this.service = this.owner.lookup('service:message');
    this.service.set('intl', this.stubs.objects.intl);
  });

  test('returns fully qualified key if it exists', function(assert) {
    this.isKeyDefined = true;

    const error = {
      translationKey: 'SOME_ERROR'
    };

    this.service.displayFromServer(error);
    assert.equal(this.service.get('messageKey'), 'errors.server.SOME_ERROR');

    this.isKeyDefined = false;
    this.service.displayFromServer(error);
    assert.equal(this.service.get('messageKey'), 'errors.general');
  });

  test('gracefully handles malformed error', function(assert) {
    this.service.displayFromServer('not a valid error object');
    assert.equal(this.service.get('messageKey'), 'errors.general');

    this.service.displayFromServer({});
    assert.equal(this.service.get('messageKey'), 'errors.general');

    this.service.displayFromServer({ someOtherKey: 'hello' });
    assert.equal(this.service.get('messageKey'), 'errors.general');
  });
});
