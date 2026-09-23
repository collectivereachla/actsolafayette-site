/* Unsubscribe page for ACT-SO Lafayette news, reached from the Unsubscribe link in one of our emails.
   The link goes to Calltime's unsubscribe function, which redirects here with ?c=<contact>&t=<signature>.
   Nothing happens until the person presses the button: mail scanners open links, and a page that
   unsubscribed on load would take people off the list who never asked. The mail app's own
   Unsubscribe button (one-click) posts to the function directly and never comes here.
   b=act-so tells the function this is the ACT-SO list only, so the rest of the person's record is
   left alone. c and t go to that function and nowhere else. */
(function () {
  var ENDPOINT = 'https://lyyqmbabqisljqrowwpr.supabase.co/functions/v1/unsubscribe';
  var q = new URLSearchParams(location.search);
  var c = (q.get('c') || '').toLowerCase();
  var t = (q.get('t') || '').toLowerCase();
  var title = document.getElementById('join-title');
  var body = document.getElementById('join-body');
  var btn = document.getElementById('join-go');
  var status = document.getElementById('join-status');
  if (!title || !body || !btn || !status) return;

  var HELP = 'josiah@actsolafayette.org';
  var BACK = ' Changed your mind? Email <a href="mailto:' + HELP + '">' + HELP + '</a> and we will add you back.';

  function finish(heading, html) {
    title.textContent = heading;
    body.innerHTML = html;
    btn.hidden = true;
    status.textContent = '';
    status.className = 'join-status';
    document.title = heading + ' — ACT-SO Lafayette';
    title.setAttribute('tabindex', '-1');
    title.focus();
  }

  function broken() {
    finish('This link does not work.',
      'It may have been cut short when it was copied. Try the Unsubscribe link in the email again, or email ' +
      '<a href="mailto:' + HELP + '">' + HELP + '</a> and we will take you off the list.');
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(c) || !/^[0-9a-f]{64}$/.test(t)) { broken(); return; }

  btn.addEventListener('click', function () {
    btn.disabled = true;
    status.className = 'join-status';
    status.textContent = 'One moment…';
    // A form body keeps this a simple request: no preflight, and c and t stay out of the URL.
    fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams({ c: c, t: t, b: 'act-so' }) })
      .then(function (r) {
        if (r.status === 400) return { status: 'invalid' };
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (d.status === 'unsubscribed') finish('You are unsubscribed.', 'This address is off the ACT-SO Lafayette news list.' + BACK);
        else if (d.status === 'already') finish('You were already unsubscribed.', 'This address was already off the ACT-SO Lafayette news list. There is nothing more to do.' + BACK);
        else broken();
      })
      .catch(function () {
        btn.disabled = false;
        btn.focus();
        status.className = 'join-status err';
        status.textContent = 'That did not go through. Try again, or email ' + HELP + '.';
      });
  });
})();
