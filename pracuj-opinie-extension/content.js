(function () {
  'use strict';

  try {
    if (location.hostname !== "www.pracuj.pl") {
      return;
    }

    if (location.pathname === "/" || location.pathname === "" || location.pathname.startsWith("/konto")) {
      return;
    }

    // === KONFIGURACJA SUPABASE ===
    const SUPABASE_URL = "https://rfxryymvidtqveultajg.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable__cExfmJLYL4yaHh4A2km2Q_hCx4GGdk";

    function getClientId() {
      let clientId = localStorage.getItem('pracuj_opinie_client_id');
      if (!clientId) {
        clientId = 'client_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('pracuj_opinie_client_id', clientId);
      }
      return clientId;
    }

    function getStoredVotes() {
      try {
        return JSON.parse(localStorage.getItem('pracuj_opinie_votes') || '{}');
      } catch (e) {
        return {};
      }
    }

    function saveStoredVotes(votesObj) {
      localStorage.setItem('pracuj_opinie_votes', JSON.stringify(votesObj));
    }

    const BAD_WORDS = ["chuj", "pizd", "kurw", "pierdol", "jeb", "skurwysyn", "cip", "huj", "pedał", "ciot", "kmiot", "pierd"];

    function containsBadWords(text) {
      if (!text) return false;
      const lower = text.toLowerCase();
      return BAD_WORDS.some(word => lower.includes(word));
    }

    function formatDateTime(isoString) {
      if (!isoString) return "";
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return "";

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }

    function getEmployerName() {
      let rawName = "";
      
      const elAttr = document.querySelector('[data-scroll-id="employer-name"]') || document.querySelector('[data-test="employer-name"]');
      if (elAttr && elAttr.textContent.trim()) {
        rawName = elAttr.textContent;
      }

      if (!rawName || rawName.trim().length <= 1) {
        const pathSegments = location.pathname.split('/').filter(Boolean);
        const companyIndex = pathSegments.indexOf('company');
        if (companyIndex !== -1 && pathSegments[companyIndex + 1]) {
          let urlSlug = pathSegments[companyIndex + 1];
          rawName = urlSlug.replace(/-/g, ' ');
        }
      }

      if (!rawName || rawName.trim().length <= 1) {
        return null; 
      }

      let cleaned = rawName.replace(/O firmie/gi, "").trim();

      const blacklistedNames = ["konto", "pracuj.pl", "pracuj", "moje aplikacje", "profil", "ustawienia", "pracodawca", "porady", "dlafirm"];
      if (blacklistedNames.includes(cleaned.toLowerCase())) {
        return null;
      }

      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      return cleaned || null;
    }

    function getPositionName() {
      const elPos = document.querySelector('h1[data-test="text-positionName"]') || document.querySelector('h1');
      if (elPos && elPos.textContent.trim()) {
        return elPos.textContent.trim();
      }
      return "brak podanego stanowiska";
    }

    // Bezpieczne konwertowanie statycznego szablonu HTML na elementy DOM bez użycia innerHTML
    function createDOMFromHTML(htmlString) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      const fragment = document.createDocumentFragment();
      Array.from(doc.body.childNodes).forEach(node => fragment.appendChild(node));
      return fragment;
    }

    async function fetchReviews(employerName) {
      try {
        const normalized = employerName.toLowerCase().trim();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?employer_name=eq.${encodeURIComponent(normalized)}&order=created_at.desc`, {
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
          }
        });
        if (!res.ok) return [];
        const reviews = await res.json();
        
        const userVotes = await fetchUserVotesFromDB();
        return reviews.map(rev => ({
          ...rev,
          userVote: userVotes[rev.id] || null
        }));
      } catch (e) {
        console.error("Błąd pobierania opinii:", e);
        return [];
      }
    }

    async function sendReview(reviewObj) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify(reviewObj)
        });
        return res.ok;
      } catch (e) {
        console.error("Błąd zapisu opinii:", e);
        return false;
      }
    }

    async function updateReviewInDB(reviewId, updateObj) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${reviewId}`, {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            "x-client-id": getClientId(),
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(updateObj)
        });
        return res.ok;
      } catch (e) {
        console.error("Błąd aktualizacji opinii:", e);
        return false;
      }
    }

    async function deleteReviewFromDB(reviewId) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${reviewId}`, {
          method: "DELETE",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "x-client-id": getClientId(),
            "Prefer": "return=minimal"
          }
        });
        return res.ok;
      } catch (e) {
        console.error("Błąd usuwania opinii:", e);
        return false;
      }
    }

    async function updateScoreInDB(reviewId, delta) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vote_review`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            "x-client-id": getClientId()
          },
          body: JSON.stringify({
            review_id: reviewId,
            delta: delta
          })
        });

        if (!res.ok) {
          console.warn("Głosowanie odrzucone.");
        }
      } catch (e) {
        console.error("Błąd aktualizacji głosu:", e);
      }
    }

    async function sendReportToDB(reviewId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ review_id: reviewId, reason: "Zgłoszenie użytkownika" })
        });
      } catch (e) {
        console.error("Błąd wysyłania zgłoszenia:", e);
      }
    }

    function checkPendingReminder() {
      try {
        const savedReminder = localStorage.getItem('pracuj_opinie_pending_reminder');
        if (!savedReminder) return;

        const reminder = JSON.parse(savedReminder);
        if (Date.now() >= reminder.targetTime) {
          if (document.getElementById("pracuj-opinie-reminder-banner")) return;

          const banner = document.createElement("div");
          banner.id = "pracuj-opinie-reminder-banner";

          const titleDiv = document.createElement("div");
          titleDiv.className = "reminder-banner-title";
          titleDiv.textContent = "⏳ Czas na opinię!";

          const textDiv = document.createElement("div");
          textDiv.className = "reminder-banner-text";
          textDiv.append(
            "Hej! Pamiętasz, że możesz wystawić opinię o przebiegu rekrutacji na stanowisko ",
            createStrongElement(reminder.position),
            " w firmie ",
            createStrongElement(reminder.company),
            "?"
          );

          const actionsDiv = document.createElement("div");
          actionsDiv.className = "reminder-banner-actions";

          const goBtn = document.createElement("a");
          goBtn.href = reminder.url;
          goBtn.className = "reminder-btn-action";
          goBtn.id = "reminder-go-btn";
          goBtn.textContent = "Wystaw opinię";

          const dismissBtn = document.createElement("button");
          dismissBtn.type = "button";
          dismissBtn.className = "reminder-btn-close";
          dismissBtn.id = "reminder-dismiss-btn";
          dismissBtn.textContent = "Później";

          actionsDiv.appendChild(goBtn);
          actionsDiv.appendChild(dismissBtn);

          banner.appendChild(titleDiv);
          banner.appendChild(textDiv);
          banner.appendChild(actionsDiv);

          document.body.appendChild(banner);

          goBtn.addEventListener("click", () => {
            localStorage.removeItem('pracuj_opinie_pending_reminder');
            banner.remove();
          });

          dismissBtn.addEventListener("click", () => {
            localStorage.removeItem('pracuj_opinie_pending_reminder');
            banner.remove();
          });
        }
      } catch (e) {
        console.error("Błąd sprawdzania przypomnienia:", e);
      }
    }

    function createStrongElement(text) {
      const el = document.createElement("strong");
      el.textContent = text;
      return el;
    }

    async function init() {
      checkPendingReminder();

      const existingWidget = document.getElementById("pracuj-opinie-widget");
      if (existingWidget) {
        existingWidget.remove();
      }

      const employerName = getEmployerName();
      if (!employerName) return; 

      getClientId();
      let reviews = await fetchReviews(employerName);
      createWidgetUI(employerName, reviews);
    }

    function createWidgetUI(employerName, reviews) {
      if (document.getElementById("pracuj-opinie-widget")) return;

      const currentYear = new Date().getFullYear();
      let currentSortMode = "newest";
      let editingReviewId = null;
      let selectedReminderWeeks = 1;

      const widget = document.createElement("div");
      widget.id = "pracuj-opinie-widget";
      widget.className = "widget-expanded";

      const header = document.createElement("div");
      header.className = "opinie-header";
      header.id = "opinie-toggle-header";

      const headerLeft = document.createElement("div");
      headerLeft.className = "opinie-header-left";
      const titleSpan = document.createElement("span");
      titleSpan.className = "opinie-title";
      titleSpan.textContent = "Opinie: ";
      titleSpan.appendChild(createStrongElement(employerName));
      headerLeft.appendChild(titleSpan);

      const headerRight = document.createElement("div");
      headerRight.className = "opinie-header-right";

      const badge = document.createElement("span");
      badge.id = "opinie-badge";
      badge.className = "opinie-badge";
      badge.textContent = reviews.length;

      const minBtn = document.createElement("button");
      minBtn.id = "opinie-minimize-btn";
      minBtn.title = "Zwiń / Rozwiń";
      minBtn.textContent = "▾";

      headerRight.appendChild(badge);
      headerRight.appendChild(minBtn);
      header.appendChild(headerLeft);
      header.appendChild(headerRight);
      widget.appendChild(header);

      const body = document.createElement("div");
      body.id = "opinie-body";
      body.className = "opinie-body";

      const sortContainer = document.createElement("div");
      sortContainer.className = "opinie-sort-container";
      
      const sortLabel = document.createElement("span");
      sortLabel.className = "opinie-sort-label";
      sortLabel.textContent = "Sortuj:";
      
      const tabsDiv = document.createElement("div");
      tabsDiv.className = "opinie-tabs";
      
      const tabNewest = document.createElement("button");
      tabNewest.type = "button";
      tabNewest.className = "opinie-tab-btn active";
      tabNewest.dataset.sort = "newest";
      tabNewest.textContent = "Od najnowszych";

      const tabBest = document.createElement("button");
      tabBest.type = "button";
      tabBest.className = "opinie-tab-btn";
      tabBest.dataset.sort = "best";
      tabBest.textContent = "Od najlepszych";

      tabsDiv.appendChild(tabNewest);
      tabsDiv.appendChild(tabBest);
      sortContainer.appendChild(sortLabel);
      sortContainer.appendChild(tabsDiv);
      body.appendChild(sortContainer);

      const listContainer = document.createElement("div");
      listContainer.id = "opinie-list";
      listContainer.className = "opinie-list";
      body.appendChild(listContainer);

      // FORMULARZ DODAWANIA OPINII
      const formContainer = document.createElement("div");
      formContainer.id = "opinie-form-container";
      formContainer.className = "opinie-form-container";
      formContainer.style.display = "none";

      const formTitle = document.createElement("h4");
      formTitle.id = "form-main-title";
      formTitle.textContent = "Dodaj opinię o rekrutacji";
      formContainer.appendChild(formTitle);

      const createLabel = (text) => {
        const lbl = document.createElement("label");
        lbl.textContent = text;
        return lbl;
      };

      formContainer.appendChild(createLabel("Nazwa stanowiska (opcjonalnie):"));
      const inputPos = document.createElement("input");
      inputPos.type = "text";
      inputPos.id = "form-position";
      inputPos.className = "form-input";
      inputPos.placeholder = "To pole może zostać puste";
      formContainer.appendChild(inputPos);

      formContainer.appendChild(createLabel("Czas rekrutacji: *"));
      const inputTime = document.createElement("select");
      inputTime.id = "form-time";
      inputTime.className = "form-input";
      ["-- Wybierz --", "poniżej 1 tygodnia", "2-4 tygodnie", "1-2 miesiące", "powyżej 2 miesięcy"].forEach((opt, idx) => {
        const option = document.createElement("option");
        option.value = idx === 0 ? "" : opt;
        option.textContent = opt;
        inputTime.appendChild(option);
      });
      formContainer.appendChild(inputTime);

      formContainer.appendChild(createLabel("Rok rekrutacji: *"));
      const inputYear = document.createElement("select");
      inputYear.id = "form-year";
      inputYear.className = "form-input";
      const defaultYearOpt = document.createElement("option");
      defaultYearOpt.value = "";
      defaultYearOpt.textContent = "-- Wybierz rok --";
      inputYear.appendChild(defaultYearOpt);
      for (let y = currentYear; y >= currentYear - 4; y--) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        inputYear.appendChild(option);
      }
      formContainer.appendChild(inputYear);

      formContainer.appendChild(createLabel("Czy zaoferowano pracę? *"));
      const inputOffered = document.createElement("select");
      inputOffered.id = "form-offered";
      inputOffered.className = "form-input";
      ["-- Wybierz --", "tak - zaakceptowałem", "tak - odrzuciłem", "nie zaoferowano", "brak odpowiedzi", "Wolę nie odpowiadać"].forEach((opt, idx) => {
        const option = document.createElement("option");
        option.value = idx === 0 ? "" : opt;
        option.textContent = opt;
        inputOffered.appendChild(option);
      });
      formContainer.appendChild(inputOffered);

      formContainer.appendChild(createLabel("Jakie wrażenia: * (max 300 znaków)"));
      const inputFeedback = document.createElement("textarea");
      inputFeedback.id = "form-feedback";
      inputFeedback.className = "form-input";
      inputFeedback.rows = 3;
      inputFeedback.maxLength = 300;
      inputFeedback.placeholder = "Opisz swoje wrażenia...";
      formContainer.appendChild(inputFeedback);

      const counterDiv = document.createElement("div");
      counterDiv.style.cssText = "font-size: 10px; color: #666; text-align: right; margin-bottom: 4px;";
      
      const charCountSpan = document.createElement("span");
      charCountSpan.id = "char-count";
      charCountSpan.textContent = "0";
      
      counterDiv.appendChild(charCountSpan);
      counterDiv.append("/300");
      formContainer.appendChild(counterDiv);

      const formActions = document.createElement("div");
      formActions.className = "form-actions";
      const cancelBtn = document.createElement("button");
      cancelBtn.id = "form-cancel-btn";
      cancelBtn.type = "button";
      cancelBtn.textContent = "Anuluj";
      const submitBtn = document.createElement("button");
      submitBtn.id = "form-submit-btn";
      submitBtn.type = "button";
      submitBtn.disabled = true;
      submitBtn.textContent = "WYŚLIJ";
      formActions.appendChild(cancelBtn);
      formActions.appendChild(submitBtn);
      formContainer.appendChild(formActions);

      body.appendChild(formContainer);

      // FORMULARZ USTAWIANIA PRZYPOMNIENIA
      const reminderContainer = document.createElement("div");
      reminderContainer.id = "opinie-reminder-container";
      reminderContainer.className = "opinie-reminder-container";
      reminderContainer.style.display = "none";

      const remTitle = document.createElement("h4");
      remTitle.textContent = "Ustaw przypomnienie o wystawieniu opinii po procesie rekrutacji!";
      
      const remSubtitle = document.createElement("div");
      remSubtitle.className = "reminder-subtitle-info";
      remSubtitle.textContent = "Powiadomienie pojawi się w lewym dolnym rogu okna, podczas przeglądania portalu.";

      const remLabel = document.createElement("label");
      remLabel.textContent = "Wyświetl powiadomienie w przeglądarce za:";

      const circlesWrapper = document.createElement("div");
      circlesWrapper.className = "reminder-circles-wrapper";

      [1, 2, 3, 4, 5].forEach(num => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = num === 1 ? "reminder-circle-btn active" : "reminder-circle-btn";
        btn.dataset.val = num;
        btn.textContent = num;
        circlesWrapper.appendChild(btn);
      });

      const unitLabelSpan = document.createElement("span");
      unitLabelSpan.className = "reminder-label-text";
      unitLabelSpan.id = "reminder-unit-label";
      unitLabelSpan.textContent = "tydzień";
      circlesWrapper.appendChild(unitLabelSpan);

      const remActions = document.createElement("div");
      remActions.className = "form-actions";

      const remCancelBtn = document.createElement("button");
      remCancelBtn.type = "button";
      remCancelBtn.id = "reminder-cancel-btn";
      remCancelBtn.textContent = "Anuluj";

      const remSubmitBtn = document.createElement("button");
      remSubmitBtn.type = "button";
      remSubmitBtn.id = "reminder-submit-btn";
      remSubmitBtn.textContent = "ZATWIERDŹ";

      remActions.appendChild(remCancelBtn);
      remActions.appendChild(remSubmitBtn);

      reminderContainer.appendChild(remTitle);
      reminderContainer.appendChild(remSubtitle);
      reminderContainer.appendChild(remLabel);
      reminderContainer.appendChild(circlesWrapper);
      reminderContainer.appendChild(remActions);

      body.appendChild(reminderContainer);

      // STOPKA
      const footer = document.createElement("div");
      footer.id = "opinie-footer";
      footer.className = "opinie-footer";

      const bellSvgHtml = '<svg class="btn-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="m9.625000000000002 71.63333333333334l22.916666666666668 22.916666666666668a17.583333333333336 17.583333333333336 0 0 1 -22.916666666666668 -22.916666666666668zm20.90416666666667 -63.38333333333334a4.166666666666667 4.166666666666667 0 0 0 -1.666666666666667 -8.166666666666668a44.537499999999994 44.537499999999994 0 0 0 -27.975000000000005 17.1875a4.166666666666667 4.166666666666667 0 0 0 6.695833333333334 4.9541666666666675a36.00416666666667 36.00416666666667 0 0 1 22.945833333333333 -13.975000000000001zm66.1375 58.5125a4.166666666666667 4.166666666666667 0 0 0 -4.9625 3.1750000000000003a35.99166666666667 35.99166666666667 0 0 1 -13.820833333333335 22.52916666666667a4.166666666666667 4.166666666666667 0 0 0 4.916666666666667 6.733333333333334a44.58333333333333 44.58333333333333 0 0 0 17.041666666666668 -27.470833333333335a4.166666666666667 4.166666666666667 0 0 0 -3.1750000000000003 -4.966666666666667zm-12.637500000000001 -44.900000000000006l6.416666666666667 -6.416666666666667a4.166666666666667 4.166666666666667 0 1 0 -5.891666666666667 -5.891666666666667l-6.425000000000001 6.425000000000001a35.233333333333334 35.233333333333334 0 0 0 -40.925 -2.0833333333333335l-22.916666666666668 14.166666666666668a20.941666666666666 20.941666666666666 0 0 0 -3.8000000000000003 32.62083333333334l28.995833333333334 28.995833333333334a20.941666666666666 20.941666666666666 0 0 0 32.6625 -3.858333333333334l15.000000000000002 -24.483333333333338a35.59583333333333 35.59583333333333 0 0 0 -3.1166666666666667 -39.475z"/></svg>';
      const chatSvgHtml = '<svg class="btn-icon" viewBox="0 0 100 100"><path d="M81.97916666666667 11.491666666666667A49.73333333333334 49.73333333333334 0 0 0 43.64166666666667 0.41666666666666674A50.000000000000014 50.000000000000014 0 0 0 50.07500000000001 100H79.16666666666667a20.858333333333338 20.858333333333338 0 0 0 20.833333333333336 -20.833333333333336V47.12083333333334l0 -0.2625A50.18333333333334 50.18333333333334 0 0 0 81.97916666666667 11.491666666666667zM33.333333333333336 29.166666666666668h16.666666666666668a4.166666666666667 4.166666666666667 0 0 1 0 8.333333333333334H33.333333333333336A4.166666666666667 4.166666666666667 0 0 1 33.333333333333336 29.166666666666668zm33.333333333333336 41.66666666666667H33.333333333333336a4.166666666666667 4.166666666666667 0 0 1 0 -8.333333333333334h33.333333333333336a4.166666666666667 4.166666666666667 0 0 1 0 8.333333333333334zm0 -16.666666666666668H33.333333333333336a4.166666666666667 4.166666666666667 0 0 1 0 -8.333333333333334h33.333333333333336a4.166666666666667 4.166666666666667 0 0 1 0 8.333333333333334z"/></svg>';

      const remBtn = document.createElement("button");
      remBtn.id = "opinie-rem-btn";
      remBtn.className = "opinie-action-btn";
      remBtn.title = "Przypomnij o opinii";
      remBtn.appendChild(createDOMFromHTML(bellSvgHtml));
      remBtn.append(" Przypomnij");

      const addBtn = document.createElement("button");
      addBtn.id = "opinie-add-btn";
      addBtn.className = "opinie-action-btn";
      addBtn.title = "Dodaj opinię";
      addBtn.appendChild(createDOMFromHTML(chatSvgHtml));
      addBtn.append(" Dodaj opinię");

      footer.appendChild(remBtn);
      footer.appendChild(addBtn);
      body.appendChild(footer);

      widget.appendChild(body);
      document.body.appendChild(widget);

      const circleBtns = reminderContainer.querySelectorAll(".reminder-circle-btn");
      const unitLabel = reminderContainer.querySelector("#reminder-unit-label");

      circleBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          circleBtns.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          selectedReminderWeeks = parseInt(btn.dataset.val, 10);
          
          if (selectedReminderWeeks === 1) {
            unitLabel.textContent = "tydzień";
          } else if (selectedReminderWeeks === 5) {
            unitLabel.textContent = "tygodni";
          } else {
            unitLabel.textContent = "tygodnie";
          }
        });
      });

      remSubmitBtn.addEventListener("click", () => {
        if (!selectedReminderWeeks) return;

        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const targetTime = Date.now() + (selectedReminderWeeks * ONE_WEEK_MS);

        const reminderData = {
          company: employerName,
          position: getPositionName(),
          url: location.href,
          targetTime: targetTime
        };

        localStorage.setItem('pracuj_opinie_pending_reminder', JSON.stringify(reminderData));

        let unitText = "tygodnie";
        if (selectedReminderWeeks === 1) unitText = "tydzień";
        else if (selectedReminderWeeks === 5) unitText = "tygodni";

        alert(`Zapisano przypomnienie! Przypomnimy Ci za ${selectedReminderWeeks} ${unitText}.`);

        reminderContainer.style.display = "none";
        listContainer.style.display = "block";
        sortContainer.style.display = "flex";
        footer.style.display = "flex";
      });

      remCancelBtn.addEventListener("click", () => {
        circleBtns.forEach(b => b.classList.remove("active"));
        reminderContainer.querySelector('.reminder-circle-btn[data-val="1"]').classList.add("active");
        selectedReminderWeeks = 1;
        unitLabel.textContent = "tydzień";

        reminderContainer.style.display = "none";
        listContainer.style.display = "block";
        sortContainer.style.display = "flex";
        footer.style.display = "flex";
      });

      remBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        circleBtns.forEach(b => b.classList.remove("active"));
        reminderContainer.querySelector('.reminder-circle-btn[data-val="1"]').classList.add("active");
        selectedReminderWeeks = 1;
        unitLabel.textContent = "tydzień";

        reminderContainer.style.display = "block";
        formContainer.style.display = "none";
        listContainer.style.display = "none";
        sortContainer.style.display = "none";
        footer.style.display = "none";
      });

      const tabButtons = sortContainer.querySelectorAll(".opinie-tab-btn");
      tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          tabButtons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          currentSortMode = btn.dataset.sort;
          renderReviews();
        });
      });

      function renderReviews() {
        listContainer.textContent = "";
        badge.textContent = reviews.length;

        if (reviews.length === 0) {
          const empty = document.createElement("div");
          empty.className = "opinie-empty";
          empty.textContent = "Brak opinii dla tej firmy. Bądź pierwszy!";
          listContainer.appendChild(empty);
          return;
        }

        let sortedReviews = [...reviews];
        if (currentSortMode === "best") {
          sortedReviews.sort((a, b) => (b.score || 0) - (a.score || 0));
        } else {
          sortedReviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        const currentClient = getClientId();

        sortedReviews.forEach((rev) => {
          if (rev.hiddenLocally) {
            const placeholder = document.createElement("div");
            placeholder.className = "opinie-item-hidden-bar";
            placeholder.title = "Kliknij, aby ponownie wyświetlić opinię";
            placeholder.addEventListener("click", () => {
              rev.hiddenLocally = false;
              renderReviews();
            });
            listContainer.appendChild(placeholder);
            return;
          }

          const item = document.createElement("div");
          item.className = "opinie-item";

          // HEADER OPINII
          const itemHeader = document.createElement("div");
          itemHeader.className = "opinie-item-header";

          const metaDiv = document.createElement("div");
          metaDiv.className = "opinie-item-meta";

          const yearSpan = document.createElement("span");
          yearSpan.className = "meta-element";
          yearSpan.title = "Rok rekrutacji";
          yearSpan.append("📅 ", createStrongElement(rev.year));

          const timeSpan = document.createElement("span");
          timeSpan.className = "meta-element";
          timeSpan.title = "Czas rekrutacji";
          timeSpan.append("⏱ ", createStrongElement(rev.time));

          metaDiv.appendChild(yearSpan);
          metaDiv.appendChild(document.createTextNode(" "));
          metaDiv.appendChild(timeSpan);

          const formattedDate = formatDateTime(rev.created_at);
          if (formattedDate) {
            const dateSpan = document.createElement("span");
            dateSpan.className = "meta-element";
            dateSpan.title = "Data dodania opinii";
            dateSpan.style.cssText = "color: #888; font-size: 10px;";
            dateSpan.textContent = `🕒 ${formattedDate}`;
            metaDiv.appendChild(document.createTextNode(" "));
            metaDiv.appendChild(dateSpan);
          }

          const flagContainer = document.createElement("div");
          flagContainer.className = "opinie-flag-container";

          const flagBtn = document.createElement("button");
          flagBtn.className = "opinie-flag-btn";
          flagBtn.title = "Opcje opinii";
          flagBtn.textContent = "🏳";

          const dropdown = document.createElement("div");
          dropdown.className = "opinie-flag-dropdown";
          dropdown.style.display = "none";

          const optReport = document.createElement("div");
          optReport.className = "flag-option flag-report";
          optReport.textContent = "Zgłoś";

          const optHide = document.createElement("div");
          optHide.className = "flag-option flag-hide";
          optHide.textContent = "Ukryj dla mnie";

          dropdown.appendChild(optReport);
          dropdown.appendChild(optHide);

          const isOwner = rev.client_id === currentClient;
          let optEdit, optDelete;

          if (isOwner) {
            optEdit = document.createElement("div");
            optEdit.className = "flag-option flag-edit";
            optEdit.style.cssText = "color: #8b0020; font-weight: bold;";
            optEdit.textContent = "Edytuj";

            optDelete = document.createElement("div");
            optDelete.className = "flag-option flag-delete";
            optDelete.style.cssText = "color: #dc3545; font-weight: bold;";
            optDelete.textContent = "Usuń";

            dropdown.appendChild(optEdit);
            dropdown.appendChild(optDelete);
          }

          flagContainer.appendChild(flagBtn);
          flagContainer.appendChild(dropdown);

          itemHeader.appendChild(metaDiv);
          itemHeader.appendChild(flagContainer);
          item.appendChild(itemHeader);

          // STANOWISKO
          if (rev.position) {
            const posDiv = document.createElement("div");
            posDiv.className = "opinie-item-pos";
            posDiv.append("Stanowisko: ", createStrongElement(rev.position));
            item.appendChild(posDiv);
          }

          // OFERTA
          const statusDiv = document.createElement("div");
          statusDiv.className = "opinie-item-status";
          statusDiv.append("Oferta: ", createStrongElement(rev.offered));
          item.appendChild(statusDiv);

          // TREŚĆ
          const textDiv = document.createElement("div");
          textDiv.className = "opinie-item-text";
          textDiv.textContent = rev.feedback;
          item.appendChild(textDiv);

          // FOOTER OPINII (OCENA I GŁOSY)
          const itemFooter = document.createElement("div");
          itemFooter.className = "opinie-item-footer";

          const scoreVal = rev.score || 0;
          const scoreFormatted = scoreVal > 0 ? "+" + scoreVal : "" + scoreVal;
          let scoreClass = "";
          if (scoreVal < 0) scoreClass = "score-negative";
          else if (scoreVal > 0) scoreClass = "score-positive";

          const scoreDiv = document.createElement("div");
          scoreDiv.className = `opinie-score ${scoreClass}`.trim();
          scoreDiv.append("Ocena: ");
          const scoreSpan = document.createElement("span");
          scoreSpan.className = "score-val";
          scoreSpan.textContent = scoreFormatted;
          scoreDiv.appendChild(scoreSpan);

          const voteBtnsDiv = document.createElement("div");
          voteBtnsDiv.className = "opinie-vote-btns";

          const plusBtn = document.createElement("button");
          plusBtn.className = `btn-vote vote-plus ${rev.userVote === 'plus' ? 'vote-active' : ''}`.trim();
          plusBtn.title = "Głosuj na plus";
          plusBtn.textContent = "+";

          const minusBtn = document.createElement("button");
          minusBtn.className = `btn-vote vote-minus ${rev.userVote === 'minus' ? 'vote-active' : ''}`.trim();
          minusBtn.title = "Głosuj na minus";
          minusBtn.textContent = "-";

          voteBtnsDiv.appendChild(plusBtn);
          voteBtnsDiv.appendChild(minusBtn);

          itemFooter.appendChild(scoreDiv);
          itemFooter.appendChild(voteBtnsDiv);
          item.appendChild(itemFooter);

          if (isOwner) {
            plusBtn.disabled = true;
            minusBtn.disabled = true;
            plusBtn.style.opacity = "0.4";
            minusBtn.style.opacity = "0.4";
            plusBtn.style.cursor = "not-allowed";
            minusBtn.style.cursor = "not-allowed";
            plusBtn.title = "Nie możesz głosować na własną opinię";
            minusBtn.title = "Nie możesz głosować na własną opinię";
          }

          flagBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".opinie-flag-dropdown").forEach(el => el.style.display = "none");
            dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
          });

          optReport.addEventListener("click", () => {
            dropdown.style.display = "none";
            sendReportToDB(rev.id);
            alert("Dziękujemy! Zgłoszenie zostało wysłane do weryfikacji.");
          });

          optHide.addEventListener("click", () => {
            dropdown.style.display = "none";
            rev.hiddenLocally = true;
            renderReviews();
          });

          if (isOwner) {
            optEdit.addEventListener("click", () => {
              dropdown.style.display = "none";
              editingReviewId = rev.id;
              
              inputPos.value = rev.position || "";
              inputTime.value = rev.time || "";
              inputYear.value = rev.year || "";
              inputOffered.value = rev.offered || "";
              inputFeedback.value = rev.feedback || "";
              charCountSpan.textContent = inputFeedback.value.length;
              
              document.getElementById("form-main-title").textContent = "Edytuj swoją opinię";
              submitBtn.textContent = "ZAPISZ ZMIANY";
              
              formContainer.style.display = "block";
              reminderContainer.style.display = "none";
              listContainer.style.display = "none";
              sortContainer.style.display = "none";
              footer.style.display = "none";
              validateForm();
            });

            optDelete.addEventListener("click", async () => {
              dropdown.style.display = "none";
              if (confirm("Czy na pewno chcesz bezpowrotnie usunąć swoją opinię?")) {
                const success = await deleteReviewFromDB(rev.id);
                if (success) {
                  reviews = await fetchReviews(employerName);
                  renderReviews();
                } else {
                  alert("Nie udało się usunąć opinii. Spróbuj ponownie.");
                }
              }
            });
          }

          const userVotes = getStoredVotes();

          plusBtn.addEventListener("click", async () => {
            let delta = 0;
            if (rev.userVote === 'plus') {
              rev.score -= 1;
              delta = -1;
              rev.userVote = null;
              delete userVotes[rev.id];
            } else if (rev.userVote === 'minus') {
              rev.score += 2;
              delta = 2;
              rev.userVote = 'plus';
              userVotes[rev.id] = 'plus';
            } else {
              rev.score += 1;
              delta = 1;
              rev.userVote = 'plus';
              userVotes[rev.id] = 'plus';
            }
            saveStoredVotes(userVotes);
            await updateScoreInDB(rev.id, delta);
            reviews = await fetchReviews(employerName);
            renderReviews();
          });

          minusBtn.addEventListener("click", async () => {
            let delta = 0;
            if (rev.userVote === 'minus') {
              rev.score += 1;
              delta = 1;
              rev.userVote = null;
              delete userVotes[rev.id];
            } else if (rev.userVote === 'plus') {
              rev.score -= 2;
              delta = -2;
              rev.userVote = 'minus';
              userVotes[rev.id] = 'minus';
            } else {
              rev.score -= 1;
              delta = -1;
              rev.userVote = 'minus';
              userVotes[rev.id] = 'minus';
            }
            saveStoredVotes(userVotes);
            await updateScoreInDB(rev.id, delta);
            reviews = await fetchReviews(employerName);
            renderReviews();
          });

          listContainer.appendChild(item);
        });
      }

      document.addEventListener("click", () => {
        document.querySelectorAll(".opinie-flag-dropdown").forEach(el => el.style.display = "none");
      });

      header.addEventListener("click", () => {
        if (widget.classList.contains("widget-collapsed")) {
          widget.classList.remove("widget-collapsed");
          widget.classList.add("widget-expanded");
          minBtn.textContent = "▾";
        } else {
          widget.classList.remove("widget-expanded");
          widget.classList.add("widget-collapsed");
          minBtn.textContent = "▴";
        }
      });

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editingReviewId = null;
        resetForm();
        document.getElementById("form-main-title").textContent = "Dodaj opinię o rekrutacji";
        submitBtn.textContent = "WYŚLIJ";
        
        formContainer.style.display = "block";
        reminderContainer.style.display = "none";
        listContainer.style.display = "none";
        sortContainer.style.display = "none";
        footer.style.display = "none";
      });

      cancelBtn.addEventListener("click", () => {
        resetForm();
        editingReviewId = null;
        formContainer.style.display = "none";
        reminderContainer.style.display = "none";
        listContainer.style.display = "block";
        sortContainer.style.display = "flex";
        footer.style.display = "flex";
      });

      function getRemainingCooldown() {
        if (editingReviewId) return 0;
        const lastSubmitTime = localStorage.getItem('pracuj_opinie_last_submit');
        if (!lastSubmitTime) return 0;
        
        const cooldownTime = 60 * 1000;
        const elapsed = Date.now() - parseInt(lastSubmitTime, 10);
        
        if (elapsed < cooldownTime) {
          return Math.ceil((cooldownTime - elapsed) / 1000);
        }
        return 0;
      }

      inputFeedback.addEventListener("input", () => {
        charCountSpan.textContent = inputFeedback.value.length;
        validateForm();
      });

      function validateForm() {
        const textVal = inputFeedback.value.trim();
        const cooldownSecs = getRemainingCooldown();
        
        const isValid = cooldownSecs === 0 && 
                        inputTime.value !== "" && 
                        inputYear.value !== "" && 
                        inputOffered.value !== "" && 
                        textVal !== "" && 
                        textVal.length <= 300;
                        
        submitBtn.disabled = !isValid;
        
        if (cooldownSecs > 0) {
          submitBtn.textContent = "Odczekaj " + cooldownSecs + "s";
        } else if (submitBtn.textContent.startsWith("Odczekaj")) {
          submitBtn.textContent = editingReviewId ? "ZAPISZ ZMIANY" : "WYŚLIJ";
        }
      }

      setInterval(() => {
        if (formContainer.style.display !== "none") {
          validateForm();
        }
      }, 1000);

      [inputTime, inputYear, inputOffered].forEach(el => {
        el.addEventListener("change", validateForm);
      });

      submitBtn.addEventListener("click", async () => {
        if (submitBtn.disabled) return;

        const feedbackText = inputFeedback.value.trim();
        const positionText = inputPos.value.trim();

        if (containsBadWords(feedbackText) || containsBadWords(positionText)) {
          alert("Twoja opinia lub nazwa stanowiska zawiera niedozwolone słowa. Prosimy o zachowanie kultury.");
          return;
        }

        submitBtn.textContent = "Zapisywanie...";
        submitBtn.disabled = true;

        let success = false;

        if (editingReviewId) {
          const updateData = {
            position: inputPos.value.trim(),
            time: inputTime.value,
            year: parseInt(inputYear.value),
            offered: inputOffered.value,
            feedback: feedbackText
          };
          success = await updateReviewInDB(editingReviewId, updateData);
        } else {
          const newReviewData = {
            employer_name: employerName.toLowerCase().trim(),
            position: inputPos.value.trim(),
            time: inputTime.value,
            year: parseInt(inputYear.value),
            offered: inputOffered.value,
            feedback: feedbackText,
            score: 0,
            client_id: getClientId()
          };
          success = await sendReview(newReviewData);
          if (success) {
            localStorage.setItem('pracuj_opinie_last_submit', Date.now().toString());
          }
        }

        if (success) {
          if (!editingReviewId) {
            localStorage.setItem('pracuj_opinie_last_submit', Date.now().toString());
          }
          
          reviews = await fetchReviews(employerName);
          
          resetForm();
          editingReviewId = null;
          renderReviews();

          formContainer.style.display = "none";
          reminderContainer.style.display = "none";
          listContainer.style.display = "block";
          sortContainer.style.display = "flex";
          footer.style.display = "flex";
        } else {
          alert("Wystąpił błąd podczas zapisywania opinii. Spróbuj ponownie.");
          submitBtn.textContent = editingReviewId ? "ZAPISZ ZMIANY" : "WYŚLIJ";
          submitBtn.disabled = false;
        }
      });

      function resetForm() {
        inputPos.value = "";
        inputTime.value = "";
        inputYear.value = "";
        inputOffered.value = "";
        inputFeedback.value = "";
        charCountSpan.textContent = "0";
        submitBtn.textContent = "WYŚLIJ";
        submitBtn.disabled = true;
      }

      renderReviews();
    }

    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        const old = document.getElementById("pracuj-opinie-widget");
        if (old) old.remove();

        if (location.hostname === "www.pracuj.pl") {
          if (location.pathname === "/" || location.pathname === "" || location.pathname.startsWith("/konto")) {
            return;
          }
        }
        setTimeout(init, 500);
      }
    });

    observer.observe(document, { subtree: true, childList: true });
    setTimeout(init, 400);

  } catch (err) {
    console.error("Błąd we wtyczce Pracuj Opinie:", err);
  }
  
  async function fetchUserVotesFromDB() {
    try {
      const clientId = getClientId();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/votes?client_id=${clientId}&select=review_id,vote_type`, {
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      if (!res.ok) return {};
      const votesData = await res.json();
      
      const votesObj = {};
      votesData.forEach(v => {
        votesObj[v.review_id] = v.vote_type;
      });
      return votesObj;
    } catch (e) {
      console.error("Błąd pobierania głosów z bazy:", e);
      return {};
    }
  }
})();
