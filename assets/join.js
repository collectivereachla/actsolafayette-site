/* Join page for the ACT-SO Lafayette news list, reached from a link in an email we sent.
   The link carries ?l=<list>&c=<contact>&i=<issued>&t=<signature>. Nothing happens until the
   person presses the button: mail scanners open links, and a page that joined on load would sign
   people up for them. The link's parts go to Calltime's list-join function and nowhere else.
   This is the site's only browser call to Calltime; the sign-up forms go through /api/signup. */
(function () {
  var URL = 'https://lyyqmbabqisljqrowwpr.supabase.co/functions/v1/list-join';
  var q = new URLSearchParams(location.search);
  var link = { l: q.get('l') || '', c: (q.get('c') || '').toLowerCase(), i: q.get('i') || '', t: (q.get('t') || '').toLowerCase() };
  var title = document.getElementById('join-title');
  var body = document.getElementById('join-body');
  var btn = document.getElementById('join-go');
  var status = document.getElementById('join-status');
  if (!title || !body || !btn || !status) return;

  var HELP = 'josiah@actsolafayette.org';
  var ON_LIST = 'We will write when there is news about the students and the ways to help them.';

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
      'It may have been cut short when it was copied. Try the link in the email again, or email ' +
      '<a href="mailto:' + HELP + '">' + HELP + '</a> and we will add you.');
  }

  var ok = link.l === 'act-so' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(link.c) &&
    /^[0-9]{9,11}$/.test(link.i) &&
    /^[0-9a-f]{32}$/.test(link.t);
  if (!ok) { broken(); return; }

  btn.addEventListener('click', function () {
    btn.disabled = true;
    status.className = 'join-status';
    status.textContent = 'One moment…';
    fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(link)
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (d.status === 'joined') finish('You are on the list.', ON_LIST);
        else if (d.status === 'already') finish('You are already on the list.', ON_LIST);
        else if (d.status === 'expired') finish('This link has expired.',
          'Email <a href="mailto:' + HELP + '">' + HELP + '</a> and we will add you.');
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
