(() => {
  const LivekitClient = window.LivekitClient;
  if (!LivekitClient) {
    setStatusEarly("تعذر تحميل مكتبة LiveKit. تحقق من الاتصال بالإنترنت.");
    return;
  }

  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  const displayNameInput = document.getElementById("displayName");
  const roomNameInput = document.getElementById("roomName");
  const enableCameraInput = document.getElementById("enableCamera");
  const joinBtn = document.getElementById("joinBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const suggestRoomBtn = document.getElementById("suggestRoomBtn");
  const toggleMicBtn = document.getElementById("toggleMicBtn");
  const toggleCameraBtn = document.getElementById("toggleCameraBtn");
  const statusEl = document.getElementById("status");
  const stage = document.getElementById("stage");
  const dock = document.getElementById("dock");
  const meetGrid = document.getElementById("meetGrid");
  const roomBadge = document.getElementById("roomBadge");
  const peopleBadge = document.getElementById("peopleBadge");

  const storageKey = "wasl-livekit-demo-v4-meet";
  const defaultApiBaseUrl = "https://api.waslacademy.net";
  const clientInstanceId =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `inst-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const lowLatencyMicCapture = {
    latency: 0,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  /** @type {import('livekit-client').Room | null} */
  let room = null;

  restoreForm();
  setStatus(
    "جاهز. لا حاجة لـ JWT — اكتب اسم الغرفة واضغط انضم.",
    false,
    true
  );

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
  toggleMicBtn.addEventListener("click", () => {
    void toggleMic();
  });
  toggleCameraBtn.addEventListener("click", () => {
    void toggleCamera();
  });

  [apiBaseUrlInput, displayNameInput, roomNameInput, enableCameraInput].forEach((el) => {
    el.addEventListener("change", persistForm);
  });

  async function joinRoom() {
    const apiBaseUrl = apiBaseUrlInput.value.trim().replace(/\/+$/, "");
    const displayName = displayNameInput.value.trim() || `مشارك-${clientInstanceId.slice(0, 6)}`;
    const roomName = roomNameInput.value.trim();
    const wantCamera = !!enableCameraInput.checked;

    if (!apiBaseUrl || !roomName) {
      setStatus("يرجى تعبئة عنوان الـ API واسم الغرفة.", true);
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
        },
        body: JSON.stringify({
          roomName,
          displayName,
          clientInstanceId,
        }),
      });

      const payload = await readJsonSafe(tokenResponse);
      if (!tokenResponse.ok) {
        throw new Error(formatApiError(payload, tokenResponse.status));
      }

      const { Room, RoomEvent, Track, DisconnectReason, AudioPresets } = LivekitClient;
      room = new Room({
        adaptiveStream: true,
        dynacast: false,
        audioCaptureDefaults: {
          ...lowLatencyMicCapture,
        },
        publishDefaults: {
          dtx: true,
          red: true,
          audioPreset: AudioPresets?.speech || undefined,
        },
      });

      bindRoomEvents(room, Track, DisconnectReason);

      await room.connect(payload.url, payload.token);

      document.body.classList.add("in-call");
      stage.hidden = false;
      dock.hidden = false;
      joinBtn.disabled = true;
      roomBadge.textContent = roomName;

      ensureTile(room.localParticipant, true);
      for (const participant of room.remoteParticipants.values()) {
        ensureTile(participant, false);
        attachExistingTracks(participant, Track);
      }
      updateGridCount();
      updatePeopleBadge();

      let mediaWarning = "";
      try {
        await room.localParticipant.setMicrophoneEnabled(true, lowLatencyMicCapture);
      } catch (micError) {
        console.warn(micError);
        mediaWarning += "تعذر تشغيل الميكروفون. ";
      }

      if (wantCamera) {
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (cameraError) {
          console.warn(cameraError);
          mediaWarning +=
            "تعذر تشغيل الكاميرا على هذا الجهاز (غالباً مستخدمة في المتصفح الآخر). يمكنك البقاء بالصوت فقط. ";
        }
      }

      syncLocalMicUi();
      syncLocalCameraUi();
      refreshLocalMedia(Track);

      const remoteCount = room.remoteParticipants.size;
      const base =
        `متصل كهوية ${payload.identity || room.localParticipant.identity}. مشاركون آخرون الآن: ${remoteCount}. ` +
        "في كل متصفح: نفس اسم الغرفة (هوية مستقلة تلقائياً).";

      if (mediaWarning) {
        setStatus(mediaWarning + base, true);
      } else if (!wantCamera) {
        setStatus("متصل بدون كاميرا (أنسب لجهازين على نفس الجهاز). " + base, false, true);
      } else {
        setStatus(base, false, true);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "فشل الانضمام للجلسة.";
      await cleanupConnection();
      setStatus(message, true);
      setBusy(false);
    }
  }

  function bindRoomEvents(activeRoom, Track, DisconnectReason) {
    const { RoomEvent } = LivekitClient;
    activeRoom
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        attachTrackToTile(track, participant, Track);
        updateGridCount();
      })
      .on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        detachTrackFromTile(track, participant);
        updateGridCount();
      })
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        handleMuteChange(publication, participant, true);
      })
      .on(RoomEvent.TrackUnmuted, (publication, participant) => {
        handleMuteChange(publication, participant, false);
      })
      .on(RoomEvent.LocalTrackPublished, (publication) => {
        if (!room) return;
        if (publication.track) {
          attachTrackToTile(publication.track, room.localParticipant, Track);
        }
        syncLocalMicUi();
        syncLocalCameraUi();
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (!room) return;
        if (publication.track) {
          detachTrackFromTile(publication.track, room.localParticipant);
        }
        syncLocalMicUi();
        syncLocalCameraUi();
        updateGridCount();
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        ensureTile(participant, false);
        updateGridCount();
        updatePeopleBadge();
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        removeTile(participant);
        updateGridCount();
        updatePeopleBadge();
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const ids = new Set(speakers.map((s) => String(s.identity || "")));
        meetGrid.querySelectorAll(".tile").forEach((tile) => {
          tile.classList.toggle("speaking", ids.has(tile.dataset.identity || ""));
        });
      })
      .on(RoomEvent.Disconnected, (reason) => {
        const reasonText = formatDisconnectReason(reason, DisconnectReason);
        setStatus(`تم قطع الاتصال: ${reasonText}`, true);
        room = null;
        resetStage();
        setBusy(false);
      });
  }

  function attachExistingTracks(participant, Track) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.track && publication.isSubscribed) {
        attachTrackToTile(publication.track, participant, Track);
      }
    }
  }

  function refreshLocalMedia(Track) {
    if (!room) return;
    for (const publication of room.localParticipant.trackPublications.values()) {
      if (publication.track) {
        attachTrackToTile(publication.track, room.localParticipant, Track);
      }
    }
  }

  function identityKey(participant) {
    return String(participant.identity || "").replace(/"/g, "");
  }

  function letterFor(name) {
    const text = String(name || "?").trim();
    return text ? text.charAt(0).toUpperCase() : "?";
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
  }

  function ensureTile(participant, isLocal) {
    const key = identityKey(participant);
    let tile = meetGrid.querySelector(`[data-identity="${cssEscape(key)}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = isLocal ? "tile local" : "tile remote";
      tile.dataset.identity = key;
      tile.dataset.local = isLocal ? "1" : "0";

      const avatar = document.createElement("div");
      avatar.className = "tile-avatar";
      avatar.textContent = letterFor(participant.name || participant.identity);
      tile.appendChild(avatar);

      const label = document.createElement("span");
      label.className = "tile-label";
      label.textContent = isLocal
        ? `${participant.name || participant.identity || "أنت"} (أنت)`
        : participant.name || participant.identity || "مشارك";
      tile.appendChild(label);

      const micBadge = document.createElement("span");
      micBadge.className = "tile-mic";
      micBadge.setAttribute("aria-hidden", "true");
      micBadge.textContent = "🎤";
      tile.appendChild(micBadge);

      if (isLocal) {
        meetGrid.prepend(tile);
      } else {
        meetGrid.appendChild(tile);
      }
    } else {
      const label = tile.querySelector(".tile-label");
      if (label) {
        label.textContent = isLocal
          ? `${participant.name || participant.identity || "أنت"} (أنت)`
          : participant.name || participant.identity || "مشارك";
      }
      const avatar = tile.querySelector(".tile-avatar");
      if (avatar) {
        avatar.textContent = letterFor(participant.name || participant.identity);
      }
    }

    syncTileMuteUi(tile, participant);
    syncTileCameraUi(tile, participant);
    return tile;
  }

  function removeTile(participant) {
    const key = identityKey(participant);
    const tile = meetGrid.querySelector(`[data-identity="${cssEscape(key)}"]`);
    if (tile) {
      tile.querySelectorAll("video, audio").forEach((el) => {
        try {
          el.srcObject = null;
        } catch {
          /* ignore */
        }
        el.remove();
      });
      tile.remove();
    }
  }

  function attachTrackToTile(track, participant, Track) {
    const tile = ensureTile(participant, participant.isLocal);
    const kind = track.kind;

    if (kind === Track.Kind.Video) {
      let video = tile.querySelector("video");
      if (!video) {
        video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        if (participant.isLocal) {
          video.muted = true;
        }
        tile.insertBefore(video, tile.firstChild);
      }
      track.attach(video);
      syncTileCameraUi(tile, participant);
    } else if (kind === Track.Kind.Audio) {
      if (participant.isLocal) {
        return;
      }
      let audio = tile.querySelector("audio");
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.style.display = "none";
        tile.appendChild(audio);
      }
      track.attach(audio);
      syncTileMuteUi(tile, participant);
    }
  }

  function detachTrackFromTile(track, participant) {
    const key = identityKey(participant);
    const tile = meetGrid.querySelector(`[data-identity="${cssEscape(key)}"]`);
    if (!tile) return;

    track.detach().forEach((el) => {
      try {
        el.srcObject = null;
      } catch {
        /* ignore */
      }
      el.remove();
    });

    syncTileCameraUi(tile, participant);
    syncTileMuteUi(tile, participant);
  }

  function handleMuteChange(publication, participant, muted) {
    const tile = ensureTile(participant, participant.isLocal);
    if (publication.kind === "video" || publication.source === "camera") {
      syncTileCameraUi(tile, participant);
      if (participant.isLocal) syncLocalCameraUi();
    }
    if (publication.kind === "audio" || publication.source === "microphone") {
      syncTileMuteUi(tile, participant);
      if (participant.isLocal) syncLocalMicUi();
    }
    void muted;
  }

  function isCameraOff(participant) {
    if (!participant) return true;
    const pubs = [...participant.trackPublications.values()];
    const cam = pubs.find((p) => p.source === "camera" || p.kind === "video");
    if (!cam || !cam.track) return true;
    return !!cam.isMuted;
  }

  function isMicMuted(participant) {
    if (!participant) return true;
    const pubs = [...participant.trackPublications.values()];
    const mic = pubs.find((p) => p.source === "microphone" || p.kind === "audio");
    if (!mic || !mic.track) return true;
    return !!mic.isMuted;
  }

  function syncTileCameraUi(tile, participant) {
    const off = isCameraOff(participant);
    tile.classList.toggle("camera-off", off);
  }

  function syncTileMuteUi(tile, participant) {
    const micBadge = tile.querySelector(".tile-mic");
    if (!micBadge) return;
    const muted = isMicMuted(participant);
    micBadge.classList.toggle("muted", muted);
    micBadge.textContent = muted ? "🔇" : "🎤";
  }

  function syncLocalMicUi() {
    if (!room) {
      toggleMicBtn.classList.add("off");
      toggleMicBtn.setAttribute("aria-pressed", "false");
      const label = toggleMicBtn.querySelector(".dock-label");
      if (label) label.textContent = "صوت مغلق";
      return;
    }
    const enabled = !!room.localParticipant.isMicrophoneEnabled;
    toggleMicBtn.classList.toggle("off", !enabled);
    toggleMicBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    const label = toggleMicBtn.querySelector(".dock-label");
    if (label) label.textContent = enabled ? "صوت مفتوح" : "صوت مغلق";
    const tile = meetGrid.querySelector('.tile[data-local="1"]');
    if (tile) syncTileMuteUi(tile, room.localParticipant);
  }

  function syncLocalCameraUi() {
    if (!room) {
      toggleCameraBtn.classList.add("off");
      toggleCameraBtn.setAttribute("aria-pressed", "false");
      const label = toggleCameraBtn.querySelector(".dock-label");
      if (label) label.textContent = "كاميرا مغلقة";
      return;
    }
    const enabled = !!room.localParticipant.isCameraEnabled;
    toggleCameraBtn.classList.toggle("off", !enabled);
    toggleCameraBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    const label = toggleCameraBtn.querySelector(".dock-label");
    if (label) label.textContent = enabled ? "كاميرا مفتوحة" : "كاميرا مغلقة";
    const tile = meetGrid.querySelector('.tile[data-local="1"]');
    if (tile) syncTileCameraUi(tile, room.localParticipant);
  }

  async function toggleMic() {
    if (!room) {
      setStatus("انضم للجلسة أولاً.", true);
      return;
    }
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      if (next) {
        await room.localParticipant.setMicrophoneEnabled(true, lowLatencyMicCapture);
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
      syncLocalMicUi();
      setStatus(next ? "الميكروفون مفتوح." : "الميكروفون مغلق.", false, true);
    } catch (error) {
      console.warn(error);
      syncLocalMicUi();
      setStatus("تعذر تغيير حالة الميكروفون.", true);
    }
  }

  async function toggleCamera() {
    if (!room) {
      setStatus("انضم للجلسة أولاً.", true);
      return;
    }
    const next = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
      const { Track } = LivekitClient;
      if (next) {
        refreshLocalMedia(Track);
      }
      syncLocalCameraUi();
      setStatus(next ? "الكاميرا مفتوحة." : "الكاميرا مغلقة.", false, true);
    } catch (error) {
      console.warn(error);
      syncLocalCameraUi();
      setStatus(
        "تعذر تغيير حالة الكاميرا. على نفس الجهاز غالباً متصفح واحد فقط يستطيع استخدام الكاميرا.",
        true
      );
    }
  }

  function updateGridCount() {
    const count = meetGrid.querySelectorAll(".tile").length;
    const capped = Math.max(1, Math.min(25, count || 1));
    meetGrid.dataset.count = String(capped);
    const cols =
      capped <= 1 ? 1 : capped <= 4 ? 2 : capped <= 9 ? 3 : capped <= 16 ? 4 : 5;
    meetGrid.style.setProperty("--cols", String(cols));
  }

  function updatePeopleBadge() {
    if (!room) {
      peopleBadge.textContent = "0 مشاركين";
      return;
    }
    const total = 1 + room.remoteParticipants.size;
    peopleBadge.textContent =
      total === 1 ? "مشارك واحد" : `${total} مشاركين`;
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

  function resetStage() {
    document.body.classList.remove("in-call");
    meetGrid.innerHTML = "";
    meetGrid.dataset.count = "1";
    meetGrid.style.setProperty("--cols", "1");
    stage.hidden = true;
    dock.hidden = true;
    joinBtn.disabled = false;
    roomBadge.textContent = "الغرفة";
    peopleBadge.textContent = "0 مشاركين";
    syncLocalMicUi();
    syncLocalCameraUi();
  }

  function setBusy(isBusy) {
    joinBtn.disabled = isBusy || !!room;
    suggestRoomBtn.disabled = isBusy;
  }

  function setStatus(message, isError = false, isOk = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
    statusEl.classList.toggle("ok", isOk && !isError);
  }

  function setStatusEarly(message) {
    const el = document.getElementById("status");
    if (el) {
      el.textContent = message;
      el.classList.add("error");
    }
  }

  function persistForm() {
    const data = {
      apiBaseUrl: apiBaseUrlInput.value,
      displayName: displayNameInput.value,
      roomName: roomNameInput.value,
      enableCamera: !!enableCameraInput.checked,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  function restoreForm() {
    apiBaseUrlInput.value = defaultApiBaseUrl;
    roomNameInput.value = "demo-room-1";
    enableCameraInput.checked = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw);
      if (data.apiBaseUrl && !isLocalhostApi(data.apiBaseUrl)) {
        apiBaseUrlInput.value = data.apiBaseUrl;
      }
      if (data.displayName) displayNameInput.value = data.displayName;
      if (data.roomName) roomNameInput.value = data.roomName;
      if (typeof data.enableCamera === "boolean") enableCameraInput.checked = data.enableCamera;
    } catch {
      /* ignore */
    }
  }

  function isLocalhostApi(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1";
    } catch {
      return /localhost|127\.0\.0\.1/i.test(url);
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
      return "الـ API ما زال يتطلب مصادقة (401). تأكد أن مسار /api/demo/livekit/token أصبح بدون رمز دخول.";
    }
    if (status === 503) {
      return "الـ API متوقف أو غير متاح (503). تحقق أن الخدمة تعمل وأن LiveKit مفعّل.";
    }
    if (status === 0) {
      return "تعذر الوصول للـ API. استخدم https://api.waslacademy.net أو صحّح CORS.";
    }
    return `فشل طلب الرمز (HTTP ${status}). تأكد أن LiveKit مفعّل على الخادم (LiveKit__Enabled=true).`;
  }

  function formatDisconnectReason(reason, DisconnectReason) {
    if (reason == null) {
      return "سبب غير معروف";
    }

    if (DisconnectReason) {
      if (reason === DisconnectReason.DUPLICATE_IDENTITY || reason === "DUPLICATE_IDENTITY") {
        return "هوية مكررة — متصفح آخر دخل بنفس الهوية. أغلق الجلسة الأخرى أو غيّر اسم العرض ثم انضم مجدداً.";
      }
      if (reason === DisconnectReason.CLIENT_INITIATED || reason === "CLIENT_INITIATED") {
        return "تم المغادرة من هذا المتصفح.";
      }
      if (reason === DisconnectReason.ROOM_DELETED || reason === "ROOM_DELETED") {
        return "تم إغلاق الغرفة.";
      }
      if (reason === DisconnectReason.JOIN_FAILURE || reason === "JOIN_FAILURE") {
        return "فشل الانضمام / شبكة.";
      }
    }

    return String(reason);
  }
})();
