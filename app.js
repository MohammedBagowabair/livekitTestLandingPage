(() => {
  const LivekitClient = window.LivekitClient;
  if (!LivekitClient) {
    setStatus("تعذر تحميل مكتبة LiveKit. تحقق من الاتصال بالإنترنت.", true);
    return;
  }

  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  const externalJwtInput = document.getElementById("externalJwt");
  const displayNameInput = document.getElementById("displayName");
  const roomNameInput = document.getElementById("roomName");
  const joinBtn = document.getElementById("joinBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const suggestRoomBtn = document.getElementById("suggestRoomBtn");
  const devTokenBtn = document.getElementById("devTokenBtn");
  const statusEl = document.getElementById("status");
  const stage = document.getElementById("stage");
  const localVideo = document.getElementById("localVideo");
  const localLabel = document.getElementById("localLabel");
  const remoteGrid = document.getElementById("remoteGrid");

  const storageKey = "wasl-livekit-demo";

  /** @type {import('livekit-client').Room | null} */
  let room = null;

  restoreForm();

  joinBtn.addEventListener("click", () => {
    void joinRoom();
  });
  leaveBtn.addEventListener("click", () => {
    void leaveRoom();
  });
  suggestRoomBtn.addEventListener("click", () => {
    roomNameInput.value = `demo-room-${Math.random().toString(16).slice(2, 10)}`;
    persistForm();
  });
  devTokenBtn.addEventListener("click", () => {
    void mintDevExternalToken();
  });

  [apiBaseUrlInput, externalJwtInput, displayNameInput, roomNameInput].forEach((el) => {
    el.addEventListener("change", persistForm);
  });

  async function mintDevExternalToken() {
    const apiBaseUrl = apiBaseUrlInput.value.trim().replace(/\/+$/, "");
    if (!apiBaseUrl) {
      setStatus("أدخل عنوان الـ API أولاً (مثال: https://localhost:7056).", true);
      return;
    }

    setStatus("جاري طلب رمز تجريبي محلي…");
    try {
      const response = await fetch(`${apiBaseUrl}/api/demo/livekit/dev-external-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayNameInput.value.trim() || "مشارك تجريبي",
        }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload, response.status));
      }

      externalJwtInput.value = payload.accessToken || "";
      persistForm();
      setStatus("تم تعبئة رمز تجريبي محلي. يمكنك الآن الانضمام للجلسة.", false, true);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "فشل طلب الرمز التجريبي.", true);
    }
  }

  async function joinRoom() {
    const apiBaseUrl = apiBaseUrlInput.value.trim().replace(/\/+$/, "");
    const jwt = externalJwtInput.value.trim();
    const displayName = displayNameInput.value.trim() || "مشارك";
    const roomName = roomNameInput.value.trim();

    if (!apiBaseUrl || !roomName) {
      setStatus("يرجى تعبئة عنوان الـ API واسم الغرفة.", true);
      return;
    }

    if (!jwt) {
      setStatus("احصل على رمز تجريبي محلي أولاً، أو الصق JWT يقبله هذا الـ API.", true);
      return;
    }

    persistForm();
    setBusy(true);
    setStatus("جاري الاتصال…");

    try {
      const tokenResponse = await fetch(`${apiBaseUrl}/api/demo/livekit/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          roomName,
          displayName,
        }),
      });

      const payload = await readJsonSafe(tokenResponse);
      if (!tokenResponse.ok) {
        throw new Error(formatApiError(payload, tokenResponse.status));
      }

      const { Room, RoomEvent, Track } = LivekitClient;
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room
        .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
          if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
            attachRemoteTrack(track, participant);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el.remove());
          cleanupEmptyRemoteTiles();
        })
        .on(RoomEvent.Disconnected, () => {
          setStatus("تم قطع الاتصال.", false);
          resetStage();
          setBusy(false);
        });

      await room.connect(payload.url, payload.token);

      localLabel.textContent = displayName;
      stage.hidden = false;
      leaveBtn.disabled = false;
      joinBtn.disabled = true;

      let mediaWarning = "";
      try {
        await room.localParticipant.setCameraEnabled(true);
      } catch (cameraError) {
        console.warn(cameraError);
        mediaWarning = "تعذر تشغيل الكاميرا (غالباً مستخدمة في النافذة الأخرى). ";
      }

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micError) {
        console.warn(micError);
        mediaWarning += "تعذر تشغيل الميكروفون. ";
      }

      const camPub = [...room.localParticipant.trackPublications.values()].find(
        (p) => p.track && p.track.kind === Track.Kind.Video
      );
      if (camPub?.track) {
        camPub.track.attach(localVideo);
      }

      if (mediaWarning) {
        setStatus(mediaWarning + "أنت متصل بالغرفة؛ جرّب نافذة/متصفح آخر أو أغلق الكاميرا في الأول.", true);
      } else {
        setStatus("متصل بالجلسة. افتح نفس الغرفة من متصفح آخر للتجربة.", false, true);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "فشل الانضمام للجلسة.";
      await cleanupConnection();
      setStatus(message, true);
      setBusy(false);
    }
  }

  async function leaveRoom() {
    await cleanupConnection();
    setStatus("غادرت الجلسة. جاهز للانضمام مجدداً.");
  }

  async function cleanupConnection() {
    try {
      if (room) {
        await room.disconnect();
      }
    } catch (error) {
      console.error(error);
    } finally {
      room = null;
      resetStage();
      setBusy(false);
    }
  }

  function attachRemoteTrack(track, participant) {
    let tile = remoteGrid.querySelector(`[data-identity="${CSS.escape(participant.identity)}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "tile remote";
      tile.dataset.identity = participant.identity;

      const label = document.createElement("span");
      label.className = "tile-label";
      label.textContent = participant.name || participant.identity;
      tile.appendChild(label);
      remoteGrid.appendChild(tile);
    }

    const media = track.attach();
    if (media instanceof HTMLMediaElement) {
      media.playsInline = true;
      media.autoplay = true;
      tile.prepend(media);
    }
  }

  function cleanupEmptyRemoteTiles() {
    [...remoteGrid.querySelectorAll(".tile")].forEach((tile) => {
      if (!tile.querySelector("video, audio")) {
        tile.remove();
      }
    });
  }

  function resetStage() {
    localVideo.srcObject = null;
    remoteGrid.innerHTML = "";
    stage.hidden = true;
    leaveBtn.disabled = true;
    joinBtn.disabled = false;
  }

  function setBusy(isBusy) {
    joinBtn.disabled = isBusy || !!room;
    suggestRoomBtn.disabled = isBusy;
    devTokenBtn.disabled = isBusy;
  }

  function setStatus(message, isError = false, isOk = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
    statusEl.classList.toggle("ok", isOk && !isError);
  }

  function persistForm() {
    const data = {
      apiBaseUrl: apiBaseUrlInput.value,
      displayName: displayNameInput.value,
      roomName: roomNameInput.value,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  function restoreForm() {
    apiBaseUrlInput.value = "https://localhost:7056";
    roomNameInput.value = "demo-room-1";
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw);
      if (data.apiBaseUrl) apiBaseUrlInput.value = data.apiBaseUrl;
      if (data.displayName) displayNameInput.value = data.displayName;
      if (data.roomName) roomNameInput.value = data.roomName;
    } catch {
      /* ignore */
    }
  }

  async function readJsonSafe(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function formatApiError(payload, status) {
    if (payload?.message) {
      return `${payload.message}${payload.code ? ` (${payload.code})` : ""}`;
    }
    if (status === 401 || status === 403) {
      return "رمز الدخول غير مقبول لهذا الـ API. للتجربة المحلية اضغط «احصل على رمز تجريبي محلي» (رموز الإنتاج لا تعمل مع Jwt المحلي).";
    }
    if (status === 0) {
      return "تعذر الوصول للـ API. استخدم عنوان HTTPS مثل https://localhost:7056 وتحقق من CORS.";
    }
    return `فشل طلب الرمز (HTTP ${status}). تأكد أن LiveKit مفعّل على الخادم.`;
  }
})();
