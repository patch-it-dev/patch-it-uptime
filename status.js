/* patch-it status page: the home view, in the style of a classic status page.
   Upptime keeps doing the monitoring (Actions), the data (history/) and the incidents (issues).
   This script replaces only Upptime's home view: an overall banner, a 90-day uptime bar per service,
   active incidents and the last 90 days of past incidents. Upptime's own history pages still work.
   Loaded through `status-website.scripts` in .upptimerc.yml; Upptime copies assets/ to the site root. */
(function () {
  'use strict';

  var OWNER = 'patch-it-dev';
  var REPO = 'patch-it-uptime';
  var RAW = 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/HEAD/history/';
  var ISSUES = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/issues?labels=status&state=all&per_page=50';
  var DAYS = 90;

  var STATE_TEXT = { up: 'Operational', degraded: 'Degraded performance', down: 'Major outage' };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function isoDay(d) { return d.toISOString().slice(0, 10); }
  function lastDays(n) {
    var out = [];
    var today = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
      out.push(isoDay(d));
    }
    return out;
  }
  function niceDate(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function minutesText(m) {
    if (m < 60) return m + ' min down';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '') + ' down';
  }
  // Day colour, like a classic status page: none, minor (< 30 min), partial (< 2 h), major.
  function dayLevel(m) { return m === 0 ? 'ok' : m < 30 ? 'minor' : m < 120 ? 'partial' : 'major'; }

  function parseYaml(text) {
    var out = {};
    text.split('\n').forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return out;
  }

  function getJSON(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw r; return r.json(); }); }
  function getText(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw r; return r.text(); }); }

  // ---------- tooltip ----------
  var tip;
  function showTip(target, html) {
    if (!tip) { tip = el('div', { class: 'pi-tip', role: 'tooltip' }); document.body.appendChild(tip); }
    tip.innerHTML = html;
    tip.hidden = false;
    var r = target.getBoundingClientRect();
    var w = tip.offsetWidth;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2 + window.scrollX), document.documentElement.clientWidth - w - 8);
    tip.style.left = left + 'px';
    tip.style.top = (r.top + window.scrollY - tip.offsetHeight - 10) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  // ---------- render ----------
  function render(root, sites, issues) {
    root.innerHTML = '';
    var days = lastDays(DAYS);

    root.appendChild(el('h1', { class: 'pi-title', text: 'System status' }));

    // Overall banner
    var down = sites.filter(function (s) { return s.status === 'down'; });
    var slow = sites.filter(function (s) { return s.status === 'degraded'; });
    var open = issues.filter(function (i) { return i.state === 'open'; });
    var level = down.length ? 'down' : slow.length || open.length ? 'degraded' : 'up';
    var bannerText = level === 'up' ? 'All systems operational'
      : down.length ? (down.length === sites.length ? 'Major outage' : 'Partial outage')
      : 'Degraded performance';
    root.appendChild(el('div', { class: 'pi-banner pi-' + level }, [
      el('span', { class: 'pi-dot', 'aria-hidden': 'true' }),
      el('p', { text: bannerText }),
    ]));

    // Active incidents
    if (open.length) {
      root.appendChild(el('h2', { class: 'pi-h', text: 'Active incidents' }));
      open.forEach(function (i) { root.appendChild(incidentCard(i, true)); });
    }

    // Services with 90-day bars
    var head = el('div', { class: 'pi-row-head' }, [
      el('span', { text: 'Uptime over the past ' + DAYS + ' days.' }),
      el('a', { href: 'https://github.com/' + OWNER + '/' + REPO + '/commits/HEAD/history', text: 'View raw history' }),
    ]);
    root.appendChild(head);
    var list = el('div', { class: 'pi-services' });
    sites.forEach(function (s) { list.appendChild(serviceRow(s, days)); });
    root.appendChild(list);

    // Legend
    root.appendChild(el('ul', { class: 'pi-legend', 'aria-label': 'Legend' }, [
      legendItem('ok', 'No downtime'), legendItem('minor', 'Under 30 min'),
      legendItem('partial', 'Under 2 h'), legendItem('major', '2 h or more'), legendItem('nodata', 'Not monitored yet'),
    ]));

    // Past incidents
    root.appendChild(el('h2', { class: 'pi-h', text: 'Past incidents' }));
    var cutoff = Date.now() - DAYS * 864e5;
    var past = issues.filter(function (i) { return i.state === 'closed' && new Date(i.created_at).getTime() > cutoff; });
    if (!past.length) root.appendChild(el('p', { class: 'pi-empty', text: 'No incidents in the last ' + DAYS + ' days.' }));
    past.forEach(function (i) { root.appendChild(incidentCard(i, false)); });

    root.appendChild(el('p', { class: 'pi-foot' }, [
      document.createTextNode('Checked every 5 minutes by GitHub Actions, independently of our own hosting. Powered by '),
      el('a', { href: 'https://upptime.js.org', text: 'Upptime' }),
      document.createTextNode('.'),
    ]));
  }

  function legendItem(level, text) {
    return el('li', null, [el('span', { class: 'pi-sw pi-' + level, 'aria-hidden': 'true' }), document.createTextNode(text)]);
  }

  function serviceRow(s, days) {
    var started = s.startTime ? s.startTime.slice(0, 10) : days[0];
    var monitored = 0, minutesDown = 0;
    var bars = el('div', { class: 'pi-bars', 'aria-hidden': 'true' });
    days.forEach(function (d) {
      var cls, tipHtml;
      if (d < started) { cls = 'nodata'; tipHtml = '<b>' + niceDate(d) + '</b><br>Not monitored yet'; }
      else {
        var m = (s.dailyMinutesDown && s.dailyMinutesDown[d]) || 0;
        monitored++; minutesDown += m;
        cls = dayLevel(m);
        tipHtml = '<b>' + niceDate(d) + '</b><br>' + (m ? minutesText(m) : 'No downtime recorded');
      }
      var b = el('span', { class: 'pi-bar pi-' + cls });
      b.addEventListener('mouseenter', function () { showTip(b, tipHtml); });
      b.addEventListener('mouseleave', hideTip);
      bars.appendChild(b);
    });
    var pct = monitored ? (100 - (minutesDown / (monitored * 1440)) * 100) : 100;
    var pctText = (Math.floor(pct * 100) / 100).toFixed(2) + '% uptime';
    var state = s.status || 'up';
    return el('section', { class: 'pi-service', 'aria-label': s.name }, [
      el('div', { class: 'pi-service-top' }, [
        el('h3', null, [el('a', { href: s.url, text: s.name }), el('span', { class: 'pi-url', text: s.url.replace(/^https?:\/\//, '') })]),
        el('span', { class: 'pi-state pi-' + state, text: STATE_TEXT[state] || state }),
      ]),
      bars,
      el('p', { class: 'sr-only', text: s.name + ': ' + pctText + ' over the monitored part of the last ' + DAYS + ' days.' }),
      el('div', { class: 'pi-axis', 'aria-hidden': 'true' }, [
        el('span', { text: DAYS + ' days ago' }), el('i'), el('span', { text: pctText }), el('i'), el('span', { text: 'Today' }),
      ]),
      el('p', { class: 'pi-more' }, [el('a', { href: '/history/' + s.slug, text: 'Response times and history' })]),
    ]);
  }

  function incidentCard(i, active) {
    var when = new Date(i.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    var ended = i.closed_at ? new Date(i.closed_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
    var title = i.title.replace(/^[^\w\[]+/, ''); // drop Upptime's leading emoji
    return el('article', { class: 'pi-incident' + (active ? ' pi-active' : '') }, [
      el('h3', null, [el('a', { href: i.html_url, text: title })]),
      el('p', { class: 'pi-meta', text: active ? 'Started ' + when + ' · investigating' : when + (ended ? ' – resolved ' + ended : '') }),
    ]);
  }

  // ---------- boot ----------
  function isHome() {
    var p = location.pathname.replace(/\/+$/, '');
    return p === '' || p === '/index.html';
  }

  function mount() {
    var main = document.querySelector('main');
    if (!main) return;
    var root = document.getElementById('pi-status');
    if (!root) {
      root = el('div', { id: 'pi-status', class: 'container', 'aria-live': 'polite' });
      main.parentNode.insertBefore(root, main.nextSibling);
    }
    var sync = function () {
      var home = isHome();
      document.documentElement.classList.toggle('pi-home', home);
      root.hidden = !home;
    };
    sync();
    setInterval(sync, 400); // Upptime is a single-page app; follow its navigation
    load(root);
  }

  function load(root) {
    root.appendChild(el('p', { class: 'pi-empty', text: 'Loading status…' }));
    getJSON(RAW + 'summary.json').then(function (summary) {
      return Promise.all(summary.map(function (s) {
        return getText(RAW + s.slug + '.yml').then(parseYaml).then(function (h) {
          s.status = h.status || s.status; s.startTime = h.startTime; return s;
        }, function () { return s; });
      })).then(function (sites) {
        return getJSON(ISSUES).then(function (issues) {
          return issues.filter(function (i) { return !i.pull_request; });
        }, function () { return []; }).then(function (issues) { render(root, sites, issues); });
      });
    }).catch(function () {
      // If anything fails, fall back to Upptime's own view.
      document.documentElement.classList.remove('pi-home');
      root.remove();
    });
  }

  if (document.readyState === 'complete') setTimeout(mount, 50);
  else window.addEventListener('load', function () { setTimeout(mount, 50); });
})();
