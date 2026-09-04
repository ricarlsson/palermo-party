(function () {
  "use strict";

  var TRIP_START = "2026-09-04";
  var TRIP_END = "2026-09-09";
  var CACHE_KEY_SCHEDULE = "pp_schedule_csv_v1";
  var CACHE_KEY_INFO = "pp_info_csv_v1";
  var CACHE_KEY_PREP = "pp_prep_csv_v1";
  var CACHE_KEY_WEATHER = "pp_weather_v1";
  var WEATHER_LAT = 38.1157;
  var WEATHER_LON = 13.3613;

  function safeGetCache(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSetCache(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }

  function fetchCsv(url, cacheKey) {
    return fetch(url, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("bad response");
        return res.text();
      })
      .then(function (text) {
        safeSetCache(cacheKey, text);
        return text;
      })
      .catch(function () {
        var cached = safeGetCache(cacheKey);
        if (cached) return cached;
        throw new Error("no data available for " + url);
      });
  }

  // ---------- Weather (Open-Meteo — free, no API key, CORS-enabled) ----------

  function fetchWeather() {
    var url =
      "https://api.open-meteo.com/v1/forecast?latitude=" + WEATHER_LAT + "&longitude=" + WEATHER_LON +
      "&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=Europe%2FRome&start_date=" + TRIP_START + "&end_date=" + TRIP_END;
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("weather fetch failed");
        return res.json();
      })
      .then(function (data) {
        safeSetCache(CACHE_KEY_WEATHER, JSON.stringify({ fetchedAt: Date.now(), data: data }));
        return data;
      })
      .catch(function () {
        var cached = safeGetCache(CACHE_KEY_WEATHER);
        if (cached) {
          try { return JSON.parse(cached).data; } catch (e) { return null; }
        }
        return null;
      });
  }

  function buildWeatherByDate(weatherData) {
    var map = {};
    if (!weatherData || !weatherData.daily || !weatherData.daily.time) return map;
    var d = weatherData.daily;
    d.time.forEach(function (date, i) {
      map[date] = {
        code: d.weathercode ? d.weathercode[i] : null,
        max: d.temperature_2m_max ? Math.round(d.temperature_2m_max[i]) : null,
        min: d.temperature_2m_min ? Math.round(d.temperature_2m_min[i]) : null,
        pop: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
      };
    });
    return map;
  }

  function weatherIcon(code) {
    var map = {
      0: ["☀️", "Clear"], 1: ["🌤️", "Mostly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
      45: ["🌫️", "Fog"], 48: ["🌫️", "Fog"],
      51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌦️", "Heavy drizzle"],
      56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"],
      61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
      66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
      71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["🌨️", "Heavy snow"], 77: ["🌨️", "Snow grains"],
      80: ["🌦️", "Rain showers"], 81: ["🌦️", "Rain showers"], 82: ["🌧️", "Heavy showers"],
      85: ["🌨️", "Snow showers"], 86: ["🌨️", "Snow showers"],
      95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm"], 99: ["⛈️", "Thunderstorm"],
    };
    return map[code] || ["🌡️", "—"];
  }

  function weatherChipHtml(w) {
    if (!w || w.max === null || w.max === undefined) return "";
    var icon = weatherIcon(w.code);
    var pop = w.pop !== null && w.pop !== undefined && w.pop >= 30 ? " · " + w.pop + "%💧" : "";
    return (
      '<span class="weather-chip" title="' + escapeHtml(icon[1]) + '">' +
      icon[0] + " " + w.max + "°/" + w.min + "°" + pop +
      "</span>"
    );
  }

  // Minimal RFC4180-ish CSV parser (handles quoted fields, embedded commas/
  // newlines, and "" escaped quotes) so the site has no external JS dependency.
  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;
    var len = text.length;

    function pushField() { row.push(field); field = ""; }
    function pushRow() { pushField(); rows.push(row); row = []; }

    while (i < len) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { pushField(); i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { pushRow(); i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) pushRow();

    rows = rows.filter(function (r) { return !(r.length === 1 && r[0] === ""); });
    if (!rows.length) return [];
    var headers = rows[0];
    return rows.slice(1).map(function (r) {
      var obj = {};
      headers.forEach(function (h, idx) { obj[h] = r[idx] !== undefined ? r[idx] : ""; });
      return obj;
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mapsLink(location) {
    return "https://maps.google.com/?q=" + encodeURIComponent(location);
  }

  function telLink(phone) {
    return "tel:" + phone.replace(/[^\d+]/g, "");
  }

  function fmtTime(t) {
    if (!t) return "";
    var parts = t.split(":");
    if (parts.length < 2) return t;
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var suffix = h >= 12 ? "pm" : "am";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + (m === "00" ? "" : ":" + m) + suffix;
  }

  function dayHeadingFor(rows) {
    return rows[0] && rows[0].day_label ? rows[0].day_label : rows[0].date;
  }

  function isTrueish(v) {
    return (v || "").trim().toLowerCase() === "yes";
  }

  // ---------- Card rendering ----------

  function renderLinks(row) {
    var links = "";
    if (row.location) {
      links += '<a class="chip-link" href="' + mapsLink(row.location) + '" target="_blank" rel="noopener">📍 Map</a> ';
    }
    if (row.contact_phone) {
      links += '<a class="chip-link tel" href="' + telLink(row.contact_phone) + '">📞 ' + escapeHtml(row.contact_name || row.contact_phone) + "</a> ";
    } else if (row.contact_name) {
      links += '<span class="chip-link tel" style="opacity:.85">' + escapeHtml(row.contact_name) + "</span> ";
    }
    if (row.link) {
      links += '<a class="chip-link secondary" href="' + escapeHtml(row.link) + '" target="_blank" rel="noopener">🔗 Link</a>';
    }
    return links;
  }

  function eventCardHtml(row) {
    var classes = ["event-card"];
    if (row.type === "task") classes.push("task");
    if (row.type === "tbc") classes.push("tbc");
    if (isTrueish(row.highlight)) classes.push("highlight");

    var badges = "";
    if (isTrueish(row.optional)) badges += '<span class="badge optional">Optional</span>';
    if (row.type === "tbc") badges += '<span class="badge tbc">Needs planning</span>';

    if (row.type === "task") {
      return (
        '<div class="' + classes.join(" ") + '">' +
        '<div class="body"><h4>' + (row.emoji ? row.emoji + " " : "") + escapeHtml(row.title) + "</h4>" +
        (row.description ? '<p class="description">' + escapeHtml(row.description) + "</p>" : "") +
        "</div></div>"
      );
    }

    return (
      '<div class="' + classes.join(" ") + '">' +
      '<div class="emoji">' + (row.emoji || "•") + "</div>" +
      '<div class="body">' +
      (row.start_time ? '<div class="time">' + fmtTime(row.start_time) + (row.end_time ? " – " + fmtTime(row.end_time) : "") + "</div>" : "") +
      "<h4>" + escapeHtml(row.title) + badges + "</h4>" +
      (row.location ? '<p class="location">' + escapeHtml(row.location) + "</p>" : "") +
      (row.description ? '<p class="description">' + escapeHtml(row.description) + "</p>" : "") +
      '<div class="links">' + renderLinks(row) + "</div>" +
      "</div></div>"
    );
  }

  function renderDay(dateStr, rows, prepItems, weather) {
    var main = rows.filter(function (r) {
      var t = (r.track || "").trim();
      return !t || t === "Everyone";
    });
    var timed = main.filter(function (r) { return r.start_time; });
    var untimed = main.filter(function (r) { return !r.start_time; });

    var html = '<section class="day-section" id="day-' + dateStr + '">';
    html +=
      '<div class="day-heading-row"><h3 class="day-heading">' + escapeHtml(dayHeadingFor(rows)) + "</h3>" +
      weatherChipHtml(weather) +
      "</div>";

    if (prepItems && prepItems.length) {
      html += '<div class="prep-card"><h4>🎒 Pack &amp; Prepare</h4><ul>';
      prepItems.forEach(function (p) { html += "<li>" + escapeHtml(p.item) + "</li>"; });
      html += "</ul></div>";
    }

    timed.forEach(function (r) { html += eventCardHtml(r); });
    if (untimed.length) {
      html += '<p class="throughout-label">Also today</p>';
      untimed.forEach(function (r) { html += eventCardHtml(r); });
    }

    // Group non-"Everyone" tracks
    var trackMap = {};
    var trackOrder = [];
    rows.forEach(function (r) {
      var t = (r.track || "").trim();
      if (!t || t === "Everyone") return;
      if (/^Return option/i.test(t)) t = "__return_options__";
      if (!trackMap[t]) { trackMap[t] = []; trackOrder.push(t); }
      trackMap[t].push(r);
    });

    trackOrder.forEach(function (t) {
      var groupRows = trackMap[t];
      var heading = t === "__return_options__" ? "🚆 Choose your return train" : escapeHtml(t);
      html += '<div class="option-group"><h5>' + heading + "</h5>";
      groupRows.forEach(function (r) { html += eventCardHtml(r); });
      html += "</div>";
    });

    html += "</section>";
    return html;
  }

  // ---------- Now / Next ----------

  function parseEventDateTime(row) {
    if (!row.date || !row.start_time) return null;
    var d = new Date(row.date + "T" + row.start_time + ":00");
    return isNaN(d.getTime()) ? null : d;
  }

  function renderNowNext(scheduleRows) {
    var container = document.getElementById("now-next");
    var now = new Date();
    var tripStart = new Date(TRIP_START + "T00:00:00");
    var tripEnd = new Date(TRIP_END + "T23:59:00");

    if (now < tripStart) {
      container.innerHTML =
        '<div class="now-card"><span class="label">Countdown</span>' +
        "<h3>The trip starts soon! 🍋</h3>" +
        '<p class="meta">See you in Palermo, 4–9 September.</p></div>';
      return;
    }
    if (now > tripEnd) {
      container.innerHTML =
        '<div class="now-card"><span class="label">All done</span>' +
        "<h3>Hope you had an amazing trip! 🎉</h3></div>";
      return;
    }

    var timedEvents = scheduleRows
      .filter(function (r) { return r.type === "event" && r.start_time; })
      .map(function (r) { return { row: r, dt: parseEventDateTime(r) }; })
      .filter(function (x) { return x.dt; })
      .sort(function (a, b) { return a.dt - b.dt; });

    var current = null;
    var next = null;
    for (var i = 0; i < timedEvents.length; i++) {
      var ev = timedEvents[i];
      var endDt = ev.row.end_time ? new Date(ev.row.date + "T" + ev.row.end_time + ":00") : new Date(ev.dt.getTime() + 2 * 60 * 60 * 1000);
      if (now >= ev.dt && now <= endDt) current = ev;
      if (!next && ev.dt > now) next = ev;
    }

    if (current) {
      container.innerHTML =
        '<div class="now-card"><span class="label live">Happening now</span>' +
        "<h3>" + (current.row.emoji || "") + " " + escapeHtml(current.row.title) + "</h3>" +
        (current.row.location ? '<p class="meta">' + escapeHtml(current.row.location) + "</p>" : "") +
        '<div class="links">' + renderLinks(current.row) + "</div></div>";
    } else if (next) {
      container.innerHTML =
        '<div class="now-card"><span class="label">Up next</span>' +
        "<h3>" + (next.row.emoji || "") + " " + escapeHtml(next.row.title) + "</h3>" +
        '<p class="meta">' + fmtTime(next.row.start_time) + (next.row.location ? " · " + escapeHtml(next.row.location) : "") + "</p>" +
        '<div class="links">' + renderLinks(next.row) + "</div></div>";
    } else {
      container.innerHTML = '<div class="now-card"><span class="label">Today</span><h3>Nothing scheduled right now — enjoy Sicily! 🍋</h3></div>';
    }
  }

  // ---------- Day nav ----------

  function renderDayNav(days) {
    var nav = document.getElementById("day-nav");
    var todayStr = new Date().toISOString().slice(0, 10);
    nav.innerHTML = days
      .map(function (d) {
        var label = d.rows[0].day_label ? d.rows[0].day_label.split("—")[0].trim() : d.date;
        var isToday = d.date === todayStr;
        return '<a class="day-chip" href="#day-' + d.date + '"' + (isToday ? ' aria-current="true"' : "") + ">" + escapeHtml(label) + "</a>";
      })
      .join("");
  }

  // ---------- Good to know ----------

  function renderGoodToKnow(infoRows, preArrivalRows) {
    var el = document.getElementById("good-to-know-content");
    var byCategory = {};
    infoRows.forEach(function (r) {
      var cat = r.category || "other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(r);
    });

    var html = "";

    if (preArrivalRows.length) {
      html += '<div class="gtk-card"><h3>🧳 Before Everyone Arrives</h3><ul>';
      preArrivalRows.forEach(function (r) {
        html += "<li>" + (r.emoji || "") + " " + escapeHtml(r.title) + (r.description ? " — " + escapeHtml(r.description) : "") + "</li>";
      });
      html += "</ul></div>";
    }

    if (byCategory.guest) {
      html += '<div class="gtk-card"><h3>👥 Who\'s here when</h3><ul>';
      byCategory.guest.forEach(function (r) { html += "<li><strong>" + escapeHtml(r.title) + "</strong> — " + escapeHtml(r.detail) + "</li>"; });
      html += "</ul></div>";
    }

    if (byCategory.transport) {
      html += '<div class="gtk-card"><h3>🚕 Getting around</h3><ul>';
      byCategory.transport.forEach(function (r) {
        html += "<li><strong>" + escapeHtml(r.title) + "</strong> — " + escapeHtml(r.detail);
        if (r.link) html += ' (<a href="' + escapeHtml(r.link) + '" target="_blank" rel="noopener">link</a>)';
        html += "</li>";
      });
      html += "</ul></div>";
    }

    if (byCategory.money) {
      html += '<div class="gtk-card"><h3>💶 Money</h3><ul>';
      byCategory.money.forEach(function (r) { html += "<li>" + escapeHtml(r.detail) + "</li>"; });
      html += "</ul></div>";
    }

    if (byCategory.contact) {
      html += '<div class="gtk-card"><h3>📇 Key contacts</h3><ul>';
      byCategory.contact.forEach(function (r) { html += "<li><strong>" + escapeHtml(r.title) + "</strong> — " + escapeHtml(r.detail) + "</li>"; });
      html += "</ul></div>";
    }

    if (byCategory.location) {
      html += '<div class="gtk-card"><h3>📍 Base</h3><ul>';
      byCategory.location.forEach(function (r) { html += "<li><strong>" + escapeHtml(r.title) + "</strong> — " + escapeHtml(r.detail) + "</li>"; });
      html += "</ul></div>";
    }

    if (byCategory.departure) {
      html += '<div class="gtk-card"><h3>🛫 Departures</h3><ul>';
      byCategory.departure.forEach(function (r) { html += "<li><strong>" + escapeHtml(r.title) + "</strong> — " + escapeHtml(r.detail) + "</li>"; });
      html += "</ul></div>";
    }

    el.innerHTML = html;
  }

  // ---------- Boot ----------

  Promise.all([
    fetchCsv("/data/schedule.csv", CACHE_KEY_SCHEDULE),
    fetchCsv("/data/info.csv", CACHE_KEY_INFO),
    fetchCsv("/data/prep.csv", CACHE_KEY_PREP),
    fetchWeather(),
  ])
    .then(function (results) {
      var scheduleRows = parseCsv(results[0]).filter(function (r) { return r.date; });
      var infoRows = parseCsv(results[1]).filter(function (r) { return r.category; });
      var prepRows = parseCsv(results[2]).filter(function (r) { return r.date; });
      var weatherByDate = buildWeatherByDate(results[3]);

      var preArrival = scheduleRows.filter(function (r) { return r.date < TRIP_START; });
      var tripRows = scheduleRows.filter(function (r) { return r.date >= TRIP_START && r.date <= TRIP_END; });

      var byDate = {};
      var dateOrder = [];
      tripRows.forEach(function (r) {
        if (!byDate[r.date]) { byDate[r.date] = []; dateOrder.push(r.date); }
        byDate[r.date].push(r);
      });
      dateOrder.sort();

      var prepByDate = {};
      prepRows.forEach(function (r) {
        if (!prepByDate[r.date]) prepByDate[r.date] = [];
        prepByDate[r.date].push(r);
      });

      var days = dateOrder.map(function (d) { return { date: d, rows: byDate[d] }; });

      renderDayNav(days);
      renderNowNext(scheduleRows);

      var scheduleEl = document.getElementById("schedule");
      scheduleEl.innerHTML = days
        .map(function (d) { return renderDay(d.date, d.rows, prepByDate[d.date] || [], weatherByDate[d.date]); })
        .join("");

      renderGoodToKnow(infoRows, preArrival);

      // Keep the active day chip roughly in sync with scroll position
      var chips = Array.prototype.slice.call(document.querySelectorAll(".day-chip"));
      var sections = Array.prototype.slice.call(document.querySelectorAll(".day-section"));
      if (window.IntersectionObserver && sections.length) {
        var observer = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              chips.forEach(function (c) { c.removeAttribute("aria-current"); });
              var match = chips.find(function (c) { return c.getAttribute("href") === "#" + entry.target.id; });
              if (match) match.setAttribute("aria-current", "true");
            });
          },
          { rootMargin: "-30% 0px -60% 0px" }
        );
        sections.forEach(function (s) { observer.observe(s); });
      }

      // Auto-scroll to today's day, if the trip is currently underway
      var todayStr = new Date().toISOString().slice(0, 10);
      if (todayStr >= TRIP_START && todayStr <= TRIP_END) {
        var todaySection = document.getElementById("day-" + todayStr);
        if (todaySection) {
          setTimeout(function () {
            todaySection.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 350);
        }
      }
    })
    .catch(function (err) {
      document.getElementById("now-next").innerHTML =
        '<div class="now-card"><h3>Couldn\'t load the schedule</h3><p class="meta">Check your connection and reload. (' + escapeHtml(err.message) + ")</p></div>";
      document.getElementById("schedule").innerHTML = "";
    });
})();
