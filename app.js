(() => {
  "use strict";

  const MAX_WORDS = 8;
  const MAX_LETTERS = 15;
  const MAX_RESULTS = 200;

  const MAQAF = "־";
  // Hebrew letters (א-ת, includes final forms); Hebrew points,
  // trop/cantillation marks and maqaf (֑-ׇ); whitespace.
  const RE_HEBREW_LETTER = /[א-ת]/;
  const RE_KEEP = /[א-ת֑-ׇ\s]/;
  // Cantillation (ta'amei hamikra) marks only — kept out of anything shown
  // to the reader, but left in place during letter-counting (they carry no
  // letters either way, so stripping them there would be a no-op).
  const RE_TROP = /[֑-֯׀ׅׄ]/g;

  // in-memory cache: wholeRef -> Promise<Array<{chapter, verse, heHtml}>>
  const verseCache = new Map();

  const parshaSelect = document.getElementById("parsha-select");
  const wordCountSelect = document.getElementById("word-count");
  const letterInputsEl = document.getElementById("letter-inputs");
  const splitMaqafEl = document.getElementById("split-maqaf");
  const searchBtn = document.getElementById("search-btn");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("results-summary");
  const listEl = document.getElementById("results-list");

  function hebrewNumeral(n) {
    if (!Number.isFinite(n) || n <= 0) return String(n);
    if (n === 15) return "ט״ו";
    if (n === 16) return "ט״ז";
    const units = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    let remaining = n;
    let letters = "";
    while (remaining >= 400) { letters += "ת"; remaining -= 400; }
    const hundredsMap = { 100: "ק", 200: "ר", 300: "ש" };
    const hundredsDigit = Math.floor(remaining / 100) * 100;
    if (hundredsDigit > 0) {
      letters += hundredsMap[hundredsDigit] || "";
      remaining %= 100;
    }
    if (remaining === 15) { letters += "ט״ו"; remaining = 0; }
    else if (remaining === 16) { letters += "ט״ז"; remaining = 0; }
    else {
      if (remaining >= 10) {
        letters += tens[Math.floor(remaining / 10)];
        remaining %= 10;
      }
      if (remaining > 0) letters += units[remaining];
    }
    if (letters.length > 1) {
      letters = letters.slice(0, -1) + "״" + letters.slice(-1);
    } else if (letters.length === 1) {
      letters += "׳";
    }
    return letters;
  }

  function populateParshaSelect() {
    const booksInOrder = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"];
    const bookHeNames = {
      Genesis: "בראשית", Exodus: "שמות", Leviticus: "ויקרא",
      Numbers: "במדבר", Deuteronomy: "דברים",
    };
    booksInOrder.forEach((book) => {
      const group = document.createElement("optgroup");
      group.label = bookHeNames[book] + " / " + book;
      PARSHIOT.forEach((p, idx) => {
        if (p.book !== book) return;
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${p.heTitle} — ${p.title}`;
        group.appendChild(opt);
      });
      parshaSelect.appendChild(group);
    });
  }

  function populateWordCountSelect() {
    for (let n = 1; n <= MAX_WORDS; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = n === 1 ? "מילה אחת" : `${n} מילים`;
      wordCountSelect.appendChild(opt);
    }
    wordCountSelect.value = "2";
  }

  function renderLetterInputs() {
    const n = parseInt(wordCountSelect.value, 10) || 1;
    letterInputsEl.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const field = document.createElement("div");
      field.className = "field";

      const label = document.createElement("label");
      label.setAttribute("for", `letters-${i}`);
      label.textContent = `אותיות במילה ${i}`;
      field.appendChild(label);

      const select = document.createElement("select");
      select.id = `letters-${i}`;
      select.className = "letters-select";
      for (let L = 1; L <= MAX_LETTERS; L++) {
        const opt = document.createElement("option");
        opt.value = String(L);
        opt.textContent = String(L);
        select.appendChild(opt);
      }
      select.value = "3";
      field.appendChild(select);

      letterInputsEl.appendChild(field);
    }
  }

  function stripTags(html) {
    return html
      // <br> is a real break between text (e.g. after a paragraph marker);
      // every other tag (like the decorative <big> around a parsha's first
      // letter) wraps text that must stay joined to what's around it, so it
      // is removed with no space in its place.
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\{[^}]*\}/g, " "); // {פ} / {ס} paragraph markers
  }

  function cleanToHebrewOnly(text) {
    let out = "";
    for (const ch of text) {
      out += RE_KEEP.test(ch) ? ch : " ";
    }
    return out;
  }

  function letterCountOf(token) {
    let count = 0;
    for (const ch of token) if (RE_HEBREW_LETTER.test(ch)) count++;
    return count;
  }

  function stripTrop(token) {
    return token.replace(RE_TROP, "");
  }

  function bareConsonants(token) {
    let out = "";
    for (const ch of token) if (RE_HEBREW_LETTER.test(ch) || ch === MAQAF) out += ch;
    return out;
  }

  function renderTilePhrase(words, matchStart, matchEnd) {
    const container = document.createElement("div");
    container.className = "tile-phrase";
    for (let i = matchStart; i <= matchEnd; i++) {
      const bare = bareConsonants(words[i].text);
      const wordEl = document.createElement("div");
      wordEl.className = "tile-word";
      for (const ch of bare) {
        if (ch === MAQAF) continue;
        const tile = document.createElement("div");
        tile.className = "letter-tile";
        tile.textContent = ch;
        wordEl.appendChild(tile);
      }
      container.appendChild(wordEl);
    }
    return container;
  }

  async function fetchVersesForRef(ref) {
    const url = `https://www.sefaria.org/api/texts/${encodeURIComponent(ref)}?commentary=0&context=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`שגיאה בשליפת הטקסט מספריא (${res.status})`);
    const data = await res.json();
    if (data.isSpanning && Array.isArray(data.spanningRefs) && data.spanningRefs.length) {
      const chunks = await Promise.all(data.spanningRefs.map(fetchVersesForRef));
      return chunks.flat();
    }
    const chapter = data.sections[0];
    // A whole-chapter ref (e.g. "Genesis 2") returns sections=[chapter] only,
    // with no verse — the chapter always starts at verse 1 in that case.
    const verseStart = data.sections.length > 1 ? data.sections[1] : 1;
    const heArr = Array.isArray(data.he) ? data.he : [];
    return heArr.map((html, idx) => ({
      chapter,
      verse: verseStart + idx,
      heHtml: html || "",
    }));
  }

  function getVersesForParsha(wholeRef) {
    if (!verseCache.has(wholeRef)) {
      verseCache.set(wholeRef, fetchVersesForRef(wholeRef));
    }
    return verseCache.get(wholeRef);
  }

  function tokenizeVerses(verses, splitMaqaf) {
    const words = [];
    for (const v of verses) {
      const cleaned = cleanToHebrewOnly(stripTags(v.heHtml));
      const rawTokens = cleaned.split(/\s+/).filter(Boolean);
      for (const raw of rawTokens) {
        const parts = splitMaqaf ? raw.split(MAQAF).filter(Boolean) : [raw];
        for (const part of parts) {
          const lc = letterCountOf(part);
          if (lc === 0) continue;
          words.push({
            text: part,
            letterCount: lc,
            chapter: v.chapter,
            verse: v.verse,
          });
        }
      }
    }
    return words;
  }

  function findMatches(words, pattern) {
    const n = pattern.length;
    const matches = [];
    for (let i = 0; i + n <= words.length; i++) {
      let ok = true;
      for (let k = 0; k < n; k++) {
        if (words[i + k].letterCount !== pattern[k]) { ok = false; break; }
      }
      if (ok) matches.push(i);
      if (matches.length >= MAX_RESULTS) break;
    }
    return matches;
  }

  function buildContext(words, matchStart, matchEnd) {
    const verseKey = (w) => `${w.chapter}:${w.verse}`;
    let ctxStart = matchStart;
    while (ctxStart - 1 >= 0 && verseKey(words[ctxStart - 1]) === verseKey(words[matchStart])) ctxStart--;
    let ctxEnd = matchEnd;
    while (ctxEnd + 1 < words.length && verseKey(words[ctxEnd + 1]) === verseKey(words[matchEnd])) ctxEnd++;

    const parts = [];
    for (let i = ctxStart; i <= ctxEnd; i++) {
      const text = stripTrop(words[i].text);
      parts.push(i >= matchStart && i <= matchEnd ? `<mark>${text}</mark>` : text);
    }
    return parts.join(" ");
  }

  function verseRefLabel(parsha, chapterFrom, verseFrom, chapterTo, verseTo) {
    const same = chapterFrom === chapterTo && verseFrom === verseTo;
    const from = `${hebrewNumeral(chapterFrom)}, ${hebrewNumeral(verseFrom)}`;
    if (same) return `${parsha.heTitle} ${from}`;
    if (chapterFrom === chapterTo) {
      return `${parsha.heTitle} ${hebrewNumeral(chapterFrom)}, ${hebrewNumeral(verseFrom)}–${hebrewNumeral(verseTo)}`;
    }
    const to = `${hebrewNumeral(chapterTo)}, ${hebrewNumeral(verseTo)}`;
    return `${parsha.heTitle} ${from} – ${to}`;
  }

  function sefariaLink(chapter, verse) {
    return `https://www.sefaria.org/${encodeURIComponent(currentParsha.book)}.${chapter}.${verse}`;
  }

  let currentParsha = null;

  function groupMatches(words, matchIndices, n) {
    const groups = new Map();
    for (const i of matchIndices) {
      const matchEnd = i + n - 1;
      const key = words.slice(i, matchEnd + 1).map((w) => bareConsonants(w.text)).join(" ");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ start: i, end: matchEnd });
    }
    return groups;
  }

  function buildOccurrenceMeta(words, occ) {
    const first = words[occ.start];
    const last = words[occ.end];
    const metaEl = document.createElement("div");
    metaEl.className = "result-meta";

    const link = document.createElement("a");
    link.href = sefariaLink(first.chapter, first.verse);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = verseRefLabel(currentParsha, first.chapter, first.verse, last.chapter, last.verse);
    metaEl.appendChild(link);

    return metaEl;
  }

  function renderResults(words, matchIndices, pattern) {
    listEl.innerHTML = "";
    const n = pattern.length;

    if (matchIndices.length === 0) {
      summaryEl.textContent = "לא נמצאו התאמות בפרשה זו.";
      return;
    }

    const groups = groupMatches(words, matchIndices, n);
    const truncated = matchIndices.length >= MAX_RESULTS;
    summaryEl.textContent = truncated
      ? `נמצאו ${groups.size}+ צירופים (מתוך ${MAX_RESULTS} המופעים הראשונים בפרשה):`
      : `נמצאו ${groups.size} צירופים:`;

    const frag = document.createDocumentFragment();
    for (const occurrences of groups.values()) {
      const primary = occurrences[0];
      const extras = occurrences.slice(1);
      const phrase = words.slice(primary.start, primary.end + 1).map((w) => stripTrop(w.text)).join(" ");

      const li = document.createElement("li");
      li.className = "result-card";

      li.appendChild(renderTilePhrase(words, primary.start, primary.end));

      const vocalizedEl = document.createElement("p");
      vocalizedEl.className = "vocalized";
      vocalizedEl.textContent = phrase;
      li.appendChild(vocalizedEl);

      li.appendChild(buildOccurrenceMeta(words, primary));

      const contextEl = document.createElement("p");
      contextEl.className = "result-context";
      contextEl.innerHTML = buildContext(words, primary.start, primary.end);
      li.appendChild(contextEl);

      if (extras.length > 0) {
        const details = document.createElement("details");
        details.className = "extra-occurrences";
        const summary = document.createElement("summary");
        summary.textContent = extras.length === 1
          ? "מופיע גם פעם נוספת בפרשה"
          : `מופיע גם ${extras.length} פעמים נוספות בפרשה`;
        details.appendChild(summary);

        for (const occ of extras) {
          const extraEl = document.createElement("div");
          extraEl.className = "extra-occurrence";
          extraEl.appendChild(buildOccurrenceMeta(words, occ));
          const extraContext = document.createElement("p");
          extraContext.className = "result-context";
          extraContext.innerHTML = buildContext(words, occ.start, occ.end);
          extraEl.appendChild(extraContext);
          details.appendChild(extraEl);
        }
        li.appendChild(details);
      }

      frag.appendChild(li);
    }
    listEl.appendChild(frag);
  }

  async function runSearch() {
    const idx = parseInt(parshaSelect.value, 10);
    currentParsha = PARSHIOT[idx];
    if (!currentParsha) return;

    const letterSelects = Array.from(document.querySelectorAll(".letters-select"));
    const pattern = letterSelects.map((s) => parseInt(s.value, 10));
    const splitMaqaf = splitMaqafEl.checked;

    searchBtn.disabled = true;
    statusEl.classList.remove("error");
    statusEl.textContent = `טוען את פרשת ${currentParsha.heTitle} מספריא...`;
    summaryEl.textContent = "";
    listEl.innerHTML = "";

    try {
      const verses = await getVersesForParsha(currentParsha.wholeRef);
      statusEl.textContent = "מחפש התאמות...";
      const words = tokenizeVerses(verses, splitMaqaf);
      const matches = findMatches(words, pattern);
      renderResults(words, matches, pattern);
      statusEl.textContent = "";
    } catch (err) {
      console.error(err);
      statusEl.textContent = "אירעה שגיאה בשליפת הטקסט. נסו שוב.";
      statusEl.classList.add("error");
    } finally {
      searchBtn.disabled = false;
    }
  }

  populateParshaSelect();
  populateWordCountSelect();
  renderLetterInputs();

  wordCountSelect.addEventListener("change", renderLetterInputs);
  searchBtn.addEventListener("click", runSearch);
})();
