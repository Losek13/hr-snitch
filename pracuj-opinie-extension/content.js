(function () {
  'use strict';

  try {
    if (location.hostname === "www.pracuj.pl" && (location.pathname === "/" || location.pathname === "")) {
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
      const elAttr = document.querySelector('[data-scroll-id="employer-name"]');
      if (elAttr && elAttr.innerText.trim()) {
        rawName = elAttr.innerText;
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
        const titleText = document.title;
        if (titleText) {
          const parts = titleText.split(/[-–|]/).map(p => p.trim());
          if (parts.length >= 2) {
            rawName = parts[1];
          } else if (parts.length === 1) {
            rawName = parts[0];
          }
        }
      }

      let cleaned = (rawName || "Pracodawca").replace(/O firmie/gi, "").trim();
      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      return cleaned || "Pracodawca";
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
          console.warn("Głosowanie odrzucone (np. próba głosu na własną opinię).");
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

    async function init() {
      const existingWidget = document.getElementById("pracuj-opinie-widget");
      if (existingWidget) {
        existingWidget.remove();
      }
      getClientId();
      const employerName = getEmployerName();
      let reviews = await fetchReviews(employerName);
      createWidgetUI(employerName, reviews);
    }

    function createWidgetUI(employerName, reviews) {
      if (document.getElementById("pracuj-opinie-widget")) return;

      const currentYear = new Date().getFullYear();
      let currentSortMode = "newest";
      let editingReviewId = null;

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
      titleSpan.innerHTML = "Opinie: <strong>" + escapeHtml(employerName) + "</strong>";
      headerLeft.appendChild(titleSpan);

      const headerRight = document.createElement("div");
      headerRight.className = "opinie-header-right";

      const badge = document.createElement("span");
      badge.id = "opinie-badge";
      badge.className = "opinie-badge";
      badge.innerText = reviews.length;

      const minBtn = document.createElement("button");
      minBtn.id = "opinie-minimize-btn";
      minBtn.title = "Zwiń / Rozwiń";
      minBtn.innerText = "▾";

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
      sortContainer.innerHTML = 
        '<span class="opinie-sort-label">Sortuj:</span>' +
        '<div class="opinie-tabs">' +
          '<button type="button" class="opinie-tab-btn active" data-sort="newest">Od najnowszych</button>' +
          '<button type="button" class="opinie-tab-btn" data-sort="best">Od najlepszych</button>' +
        '</div>';
      body.appendChild(sortContainer);

      const listContainer = document.createElement("div");
      listContainer.id = "opinie-list";
      listContainer.className = "opinie-list";
      body.appendChild(listContainer);

      const formContainer = document.createElement("div");
      formContainer.id = "opinie-form-container";
      formContainer.className = "opinie-form-container";
      formContainer.style.display = "none";

      const formTitle = document.createElement("h4");
      formTitle.id = "form-main-title";
      formTitle.innerText = "Dodaj opinię o rekrutacji";
      formContainer.appendChild(formTitle);

      const createLabel = (text) => {
        const lbl = document.createElement("label");
        lbl.innerText = text;
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
        option.innerText = opt;
        inputTime.appendChild(option);
      });
      formContainer.appendChild(inputTime);

      formContainer.appendChild(createLabel("Rok rekrutacji: *"));
      const inputYear = document.createElement("select");
      inputYear.id = "form-year";
      inputYear.className = "form-input";
      const defaultYearOpt = document.createElement("option");
      defaultYearOpt.value = "";
      defaultYearOpt.innerText = "-- Wybierz rok --";
      inputYear.appendChild(defaultYearOpt);
      for (let y = currentYear; y >= currentYear - 4; y--) {
        const option = document.createElement("option");
        option.value = y;
        option.innerText = y;
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
        option.innerText = opt;
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
      counterDiv.innerHTML = '<span id="char-count">0</span>/300';
      formContainer.appendChild(counterDiv);

      const formActions = document.createElement("div");
      formActions.className = "form-actions";
      const cancelBtn = document.createElement("button");
      cancelBtn.id = "form-cancel-btn";
      cancelBtn.type = "button";
      cancelBtn.innerText = "Anuluj";
      const submitBtn = document.createElement("button");
      submitBtn.id = "form-submit-btn";
      submitBtn.type = "button";
      submitBtn.disabled = true;
      submitBtn.innerText = "WYŚLIJ";
      formActions.appendChild(cancelBtn);
      formActions.appendChild(submitBtn);
      formContainer.appendChild(formActions);

      body.appendChild(formContainer);

      const footer = document.createElement("div");
      footer.id = "opinie-footer";
      footer.className = "opinie-footer";
      const addBtn = document.createElement("button");
      addBtn.id = "opinie-add-btn";
      addBtn.className = "opinie-add-btn";
      addBtn.title = "Dodaj opinię";
      addBtn.innerText = "Dodaj opinię +";
      footer.appendChild(addBtn);
      body.appendChild(footer);

      widget.appendChild(body);
      document.body.appendChild(widget);

      const tabButtons = sortContainer.querySelectorAll(".opinie-tab-btn");
      tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          tabButtons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          currentSortMode = btn.getAttribute("data-sort");
          renderReviews();
        });
      });

      function renderReviews() {
        listContainer.innerHTML = "";
        badge.innerText = reviews.length;

        if (reviews.length === 0) {
          const empty = document.createElement("div");
          empty.className = "opinie-empty";
          empty.innerText = "Brak opinii dla tej firmy. Bądź pierwszy!";
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

          const posHtml = rev.position ? '<div class="opinie-item-pos">Stanowisko: <strong>' + escapeHtml(rev.position) + '</strong></div>' : "";
          const scoreVal = rev.score || 0;
          const scoreFormatted = scoreVal > 0 ? "+" + scoreVal : "" + scoreVal;
          const plusActiveClass = rev.userVote === 'plus' ? 'vote-active' : '';
          const minusActiveClass = rev.userVote === 'minus' ? 'vote-active' : '';
          const formattedDate = formatDateTime(rev.created_at);

          let scoreClass = "";
          if (scoreVal < 0) {
            scoreClass = "score-negative";
          } else if (scoreVal > 0) {
            scoreClass = "score-positive";
          }

          const isOwner = rev.client_id === currentClient;

          let dropdownOptions = '<div class="flag-option flag-report">Zgłoś</div>' +
                                '<div class="flag-option flag-hide">Ukryj dla mnie</div>';
          
          if (isOwner) {
            dropdownOptions += '<div class="flag-option flag-edit" style="color: #8b0020; font-weight: bold;">Edytuj</div>' +
                               '<div class="flag-option flag-delete" style="color: #dc3545; font-weight: bold;">Usuń</div>';
          }

          // 1. NAJPIERW WSTAWIANY JEST HTML
          item.innerHTML = 
            '<div class="opinie-item-header">' +
              '<div class="opinie-item-meta">' +
                '<span class="meta-element" title="Rok rekrutacji">📅 <strong>' + rev.year + '</strong></span> ' +
                '<span class="meta-element" title="Czas rekrutacji">⏱ <strong>' + escapeHtml(rev.time) + '</strong></span>' +
                (formattedDate ? '<span class="meta-element" title="Data dodania opinii" style="color: #888; font-size: 10px;">🕒 ' + formattedDate + '</span>' : '') +
              '</div>' +
              '<div class="opinie-flag-container">' +
                '<button class="opinie-flag-btn" title="Opcje opinii">🏳</button>' +
                '<div class="opinie-flag-dropdown" style="display: none;">' +
                  dropdownOptions +
                '</div>' +
              '</div>' +
            '</div>' +
            posHtml +
            '<div class="opinie-item-status">Oferta: <strong>' + escapeHtml(rev.offered) + '</strong></div>' +
            '<div class="opinie-item-text">' + escapeHtml(rev.feedback) + '</div>' +
            '<div class="opinie-item-footer">' +
              '<div class="opinie-score ' + scoreClass + '">' +
                'Ocena: <span class="score-val">' + scoreFormatted + '</span>' +
              '</div>' +
              '<div class="opinie-vote-btns">' +
                '<button class="btn-vote vote-plus ' + plusActiveClass + '" title="Głosuj na plus">+</button>' +
                '<button class="btn-vote vote-minus ' + minusActiveClass + '" title="Głosuj na minus">-</button>' +
              '</div>' +
            '</div>';

          // 2. POBRANIE PRZYCISKÓW PO UTWORZENIU DOM
          const plusBtn = item.querySelector(".vote-plus");
          const minusBtn = item.querySelector(".vote-minus");

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

          const flagBtn = item.querySelector(".opinie-flag-btn");
          const dropdown = item.querySelector(".opinie-flag-dropdown");
          flagBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".opinie-flag-dropdown").forEach(el => el.style.display = "none");
            dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
          });

          item.querySelector(".flag-report").addEventListener("click", () => {
            dropdown.style.display = "none";
            sendReportToDB(rev.id);
            alert("Dziękujemy! Zgłoszenie zostało wysłane do weryfikacji.");
          });

          item.querySelector(".flag-hide").addEventListener("click", () => {
            dropdown.style.display = "none";
            rev.hiddenLocally = true;
            renderReviews();
          });

          if (isOwner) {
            item.querySelector(".flag-edit").addEventListener("click", () => {
              dropdown.style.display = "none";
              editingReviewId = rev.id;
              
              inputPos.value = rev.position || "";
              inputTime.value = rev.time || "";
              inputYear.value = rev.year || "";
              inputOffered.value = rev.offered || "";
              inputFeedback.value = rev.feedback || "";
              charCount.innerText = inputFeedback.value.length;
              
              document.getElementById("form-main-title").innerText = "Edytuj swoją opinię";
              submitBtn.innerText = "ZAPISZ ZMIANY";
              
              formContainer.style.display = "block";
              listContainer.style.display = "none";
              sortContainer.style.display = "none";
              footer.style.display = "none";
              widget.style.maxHeight = "620px";
              validateForm();
            });

            item.querySelector(".flag-delete").addEventListener("click", async () => {
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
          minBtn.innerText = "▾";
        } else {
          widget.classList.remove("widget-expanded");
          widget.classList.add("widget-collapsed");
          minBtn.innerText = "▴";
        }
      });

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editingReviewId = null;
        resetForm();
        document.getElementById("form-main-title").innerText = "Dodaj opinię o rekrutacji";
        submitBtn.innerText = "WYŚLIJ";
        
        formContainer.style.display = "block";
        listContainer.style.display = "none";
        sortContainer.style.display = "none";
        footer.style.display = "none";
        widget.style.maxHeight = "620px";
      });

      cancelBtn.addEventListener("click", () => {
        resetForm();
        editingReviewId = null;
        formContainer.style.display = "none";
        listContainer.style.display = "block";
        sortContainer.style.display = "flex";
        footer.style.display = "flex";
        widget.style.maxHeight = "520px";
      });

      const charCount = document.getElementById("char-count");

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
        const len = inputFeedback.value.length;
        charCount.innerText = len;
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
          submitBtn.innerText = "Odczekaj " + cooldownSecs + "s";
        } else if (submitBtn.innerText.startsWith("Odczekaj")) {
          submitBtn.innerText = editingReviewId ? "ZAPISZ ZMIANY" : "WYŚLIJ";
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

        submitBtn.innerText = "Zapisywanie...";
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
          listContainer.style.display = "block";
          sortContainer.style.display = "flex";
          footer.style.display = "flex";
          widget.style.maxHeight = "520px";
        } else {
          alert("Wystąpił błąd podczas zapisywania opinii. Spróbuj ponownie.");
          submitBtn.innerText = editingReviewId ? "ZAPISZ ZMIANY" : "WYŚLIJ";
          submitBtn.disabled = false;
        }
      });

      function resetForm() {
        inputPos.value = "";
        inputTime.value = "";
        inputYear.value = "";
        inputOffered.value = "";
        inputFeedback.value = "";
        charCount.innerText = "0";
        submitBtn.innerText = "WYŚLIJ";
        submitBtn.disabled = true;
      }

      renderReviews();
    }

    function escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        const old = document.getElementById("pracuj-opinie-widget");
        if (old) old.remove();

        if (location.hostname === "www.pracuj.pl" && (location.pathname === "/" || location.pathname === "")) {
          return;
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/votes?client_id=eq.${clientId}&select=review_id,vote_type`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return {};
    const votesData = await res.json();
    
    // Zamieniamy tablicę z bazy na obiekt { review_id: 'plus'/'minus' }
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
