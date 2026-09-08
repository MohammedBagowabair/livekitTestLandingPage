(() => {
  const LivekitClient = window.LivekitClient;
  if (!LivekitClient) {
    setStatus("ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ù…ÙƒØªØ¨Ø© LiveKit. ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø¥Ù†ØªØ±Ù†Øª.", true);
    return;
  }

  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  const displayNameInput = document.getElementById("displayName");
  const roomNameInput = document.getElementById("roomName");
  const enableCameraInput = document.getElementById("enableCamera");
  const joinBtn = document.getElementById("joinBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const suggestRoomBtn = document.getElementById("suggestRoomBtn");
  const toggleCameraBtn = document.getElementById("toggleCameraBtn");
  const toggleCameraBtnBar = document.getElementById("toggleCameraBtnBar");
  const toggleMicBtn = document.getElementById("toggleMicBtn");
  const leaveBtnBar = document.getElementById("leaveBtnBar");
  const meetGrid = document.getElementById("meetGrid");
  const roomBadge = document.getElementById("roomBadge");
  const statusEl = document.getElementById("status");
  const stage = document.getElementById("stage");

  const storageKey = "wasl-livekit-demo-v3-anon";
  const defaultApiBaseUrl = "https://api.waslacademy.net";
  const clientInstanceId =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `inst-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  /** @type {import('livekit-client').Room | null} */
  let room = null;

  restoreForm();
  setStatus(
    "Ø¬Ø§Ù‡Ø². Ù„Ø§ Ø­Ø§Ø¬Ø© Ù„Ù€ JWT â€” Ø£Ø¯Ø®Ù„ Ø§Ø³Ù… Ø§Ù„ØºØ±ÙØ© ÙˆØ§Ø³Ù…Ùƒ Ø«Ù… Ø§Ù†Ø¶Ù… (ÙŠØªØ·Ù„Ø¨ API Ù…Ø¬Ù‡ÙˆÙ„ + LiveKit Ù…ÙØ¹Ù‘Ù„).",
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
  toggleCameraBtn.addEventListener("click", () => {
    void toggleCamera();
  });
  toggleCameraBtnBar.addEventListener("click", () => {
    void toggleCamera();
  });
  toggleMicBtn.addEventListener("click", () => {
    void toggleMic();
  });
  leaveBtnBar.addEventListener("click", () => {
    void leaveRoom();
  });

  [apiBaseUrlInput, displayNameInput, roomNameInput, enableCameraInput].forEach((el) => {
    el.addEventListener("change", persistForm);
  });

  async function joinRoom() {
    const apiBaseUrl = apiBaseUrlInput.value.trim().replace(/\/+$/, "");
    const displayName = displayNameInput.value.trim() || `Ù…Ø´Ø§Ø±Ùƒ-${clientInstanceId.slice(0, 6)}`;
    const roomName = roomNameInput.value.trim();
    const wantCamera = !!enableCameraInput.checked;

    if (!apiBaseUrl || !roomName) {
      setStatus("ÙŠØ±Ø¬Ù‰ ØªØ¹Ø¨Ø¦Ø© Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ù€ API ÙˆØ§Ø³Ù… Ø§Ù„ØºØ±ÙØ©.", true);
      return;
    }


    persistForm();
    setBusy(true);
    setStatus("Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø§ØªØµØ§Ù„â€¦");

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

      const { Room, RoomEvent, Track, DisconnectReason } = LivekitClient;
      // Low-latency defaults for small demo rooms (2–few peers).
      // Does not touch WaslAcademy product apps — this Pages site only.
      room = new Room({
        adaptiveStream: true,
        // Dynacast helps large rooms; for 1:1 / small demos it adds negotiation overhead.
        dynacast: false,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          // Prefer lowest buffer the browser will give (best-effort).
          latency: 0,
          channelCount: 1,
        },
        publishDefaults: {
          // Speech-oriented audio; avoid heavy video simulcast defaults for mic-only demos.
          dtx: true,
          red: true,
          forceStereo: false,
        },
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
        .on(RoomEvent.Disconnected, (reason) => {
          const reasonText = formatDisconnectReason(reason, DisconnectReason);
          setStatus(`ØªÙ… Ù‚Ø·Ø¹ Ø§Ù„Ø§ØªØµØ§Ù„: ${reasonText}`, true);
          room = null;
          resetStage();
          setBusy(false);
        });

      await room.connect(payload.url, payload.token);

      stage.hidden = false;
      leaveBtn.disabled = false;
      leaveBtnBar.disabled = false;
      joinBtn.disabled = true;
      toggleCameraBtn.disabled = false;
      toggleCameraBtnBar.disabled = false;
      toggleMicBtn.disabled = false;
      if (roomBadge) roomBadge.textContent = `Room: ${roomName}`;
      ensureTile(payload.identity || room.localParticipant.identity, displayName, true);
      if (!wantCamera) {
        meetGrid.querySelector(".tile.local")?.classList.add("camera-off");
      }
      syncLocalCameraUi();
      syncLocalMicUi();

      room
        .on(RoomEvent.TrackMuted, (pub, participant) => {
          if (participant === room.localParticipant) {
            syncLocalCameraUi();
            syncLocalMicUi();
            return;
          }
          const tile = meetGrid.querySelector(
            `[data-identity="${String(participant.identity || "").replace(/"/g, "")}"]`
          );
          if (tile && pub.kind === Track.Kind.Video) tile.classList.add("camera-off");
        })
        .on(RoomEvent.TrackUnmuted, (pub, participant) => {
          if (participant === room.localParticipant) {
            syncLocalCameraUi();
            syncLocalMicUi();
            return;
          }
          const tile = meetGrid.querySelector(
            `[data-identity="${String(participant.identity || "").replace(/"/g, "")}"]`
          );
          if (tile && pub.kind === Track.Kind.Video) tile.classList.remove("camera-off");
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          meetGrid
            .querySelector(`[data-identity="${String(participant.identity || "").replace(/"/g, "")}"]`)
            ?.remove();
          updateGridCount();
        })
        .on(RoomEvent.ParticipantConnected, (participant) => {
          ensureTile(participant.identity, participant.name || participant.identity, false).classList.add(
            "camera-off"
          );
        });

      let mediaWarning = "";
      try {
        await room.localParticipant.setMicrophoneEnabled(true, {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          latency: 0,
          channelCount: 1,
        });
      } catch (micError) {
        console.warn(micError);
        mediaWarning += "ØªØ¹Ø°Ø± ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…ÙŠÙƒØ±ÙˆÙÙˆÙ†. ";
      }

      if (wantCamera) {
        try {
          await room.localParticipant.setCameraEnabled(true);
          attachLocalCamera();
        } catch (cameraError) {
          console.warn(cameraError);
          mediaWarning +=
            "ØªØ¹Ø°Ø± ØªØ´ØºÙŠÙ„ Ø§Ù„ÙƒØ§Ù…ÙŠØ±Ø§ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø² (ØºØ§Ù„Ø¨Ø§Ù‹ Ù…Ø³ØªØ®Ø¯Ù…Ø© ÙÙŠ Ø§Ù„Ù…ØªØµÙØ­ Ø§Ù„Ø¢Ø®Ø±). ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¨Ù‚Ø§Ø¡ Ø¨Ø§Ù„ØµÙˆØª ÙÙ‚Ø·. ";
        }
      }

      const remoteCount = room.remoteParticipants.size;
      const base =
        `Ù…ØªØµÙ„ ÙƒÙ‡ÙˆÙŠØ© ${payload.identity}. Ù…Ø´Ø§Ø±ÙƒÙˆÙ† Ø¢Ø®Ø±ÙˆÙ† Ø§Ù„Ø¢Ù†: ${remoteCount}. ` +
        "ÙÙŠ ÙƒÙ„ Ù…ØªØµÙØ­: Ù†ÙØ³ Ø§Ø³Ù… Ø§Ù„ØºØ±ÙØ©ØŒ Ø£Ø³Ù…Ø§Ø¡ Ø¹Ø±Ø¶ Ù…Ø®ØªÙ„ÙØ©.";

      if (mediaWarning) {
        setStatus(mediaWarning + base, true);
      } else if (!wantCamera) {
        setStatus("Ù…ØªØµÙ„ Ø¨Ø¯ÙˆÙ† ÙƒØ§Ù…ÙŠØ±Ø§ (Ø£Ù†Ø³Ø¨ Ù„Ø¬Ù‡Ø§Ø²ÙŠÙ† Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„Ø¬Ù‡Ø§Ø²). " + base, false, true);
      } else {
        setStatus(base, false, true);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "ÙØ´Ù„ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ù„Ù„Ø¬Ù„Ø³Ø©.";
      await cleanupConnection();
      setStatus(message, true);
      setBusy(false);
    }
  }

  async function toggleCamera() {
    if (!room) {
      setStatus("Join the session first.", true);
      return;
    }
    const next = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
      syncLocalCameraUi();
      setStatus(next ? "Camera on." : "Camera off.", false, true);
    } catch (error) {
      console.warn(error);
      setStatus("Could not toggle camera on this device.", true);
    }
  }

  async function toggleMic() {
    if (!room) {
      setStatus("Join the session first.", true);
      return;
    }
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next, {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
        latency: 0,
        channelCount: 1,
      });
      syncLocalMicUi();
      setStatus(next ? "Mic on." : "Mic off.", false, true);
    } catch (error) {
      console.warn(error);
      setStatus("Could not toggle microphone.", true);
    }
  }

  function ensureTile(identity, labelText, isLocal) {
    const key = String(identity || "").replace(/"/g, "");
    let tile = meetGrid.querySelector(`[data-identity="${key}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "tile" + (isLocal ? " local" : "");
      tile.dataset.identity = key;

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      if (isLocal) video.muted = true;
      tile.appendChild(video);

      const avatar = document.createElement("div");
      avatar.className = "tile-avatar";
      const initial = (labelText || "?").trim().slice(0, 1) || "?";
      avatar.textContent = initial;
      tile.appendChild(avatar);

      const label = document.createElement("span");
      label.className = "tile-label";
      label.textContent = labelText || identity;
      tile.appendChild(label);

      meetGrid.appendChild(tile);
      updateGridCount();
    } else {
      const label = tile.querySelector(".tile-label");
      if (label && labelText) label.textContent = labelText;
      const avatar = tile.querySelector(".tile-avatar");
      if (avatar && labelText) avatar.textContent = labelText.trim().slice(0, 1) || "?";
    }
    return tile;
  }

  function updateGridCount() {
    meetGrid.dataset.count = String(meetGrid.querySelectorAll(".tile").length || 1);
  }

  function syncLocalCameraUi() {
    if (!room) return;
    const on = !!room.localParticipant.isCameraEnabled;
    const tile = ensureTile(
      room.localParticipant.identity,
      displayNameInput.value.trim() || "You",
      true
    );
    tile.classList.toggle("camera-off", !on);
    toggleCameraBtn.textContent = on ? "Turn camera off" : "Turn camera on";
    // keep Arabic button if present in HTML default - set bilingual short labels
    toggleCameraBtn.textContent = on ? "إيقاف الكاميرا" : "تشغيل الكاميرا";
    toggleCameraBtnBar.classList.toggle("off", !on);
    if (on) {
      const { Track } = LivekitClient;
      const camPub = [...room.localParticipant.trackPublications.values()].find(
        (p) => p.track && p.track.kind === Track.Kind.Video
      );
      const video = tile.querySelector("video");
      if (camPub?.track && video) camPub.track.attach(video);
    }
  }

  function syncLocalMicUi() {
    if (!room) return;
    const on = !!room.localParticipant.isMicrophoneEnabled;
    toggleMicBtn.classList.toggle("off", !on);
    toggleMicBtn.textContent = on ? "🎤" : "🔇";
  }

  function attachLocalCamera() {
    syncLocalCameraUi();
  }

  async function leaveRoom() {
    await cleanupConnection();
    setStatus("ØºØ§Ø¯Ø±Øª Ø§Ù„Ø¬Ù„Ø³Ø©. Ø¬Ø§Ù‡Ø² Ù„Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ù…Ø¬Ø¯Ø¯Ø§Ù‹.");
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
    const tile = ensureTile(
      participant.identity,
      participant.name || participant.identity,
      false
    );
    const { Track } = LivekitClient;
    if (track.kind === Track.Kind.Video) {
      const video = tile.querySelector("video");
      track.attach(video);
      tile.classList.remove("camera-off");
    } else if (track.kind === Track.Kind.Audio) {
      const media = track.attach();
      if (media instanceof HTMLMediaElement) {
        media.autoplay = true;
        media.style.display = "none";
        tile.appendChild(media);
      }
    }
  }

  function cleanupEmptyRemoteTiles() {
    updateGridCount();
  }

  function resetStage() {
    meetGrid.innerHTML = "";
    meetGrid.dataset.count = "1";
    if (roomBadge) roomBadge.textContent = "";
    stage.hidden = true;
    leaveBtn.disabled = true;
    leaveBtnBar.disabled = true;
    joinBtn.disabled = false;
    toggleCameraBtn.disabled = true;
    toggleCameraBtnBar.disabled = true;
    toggleMicBtn.disabled = true;
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

  function isProductionApi(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "api.waslacademy.net" || host.endsWith(".waslacademy.net");
    } catch {
      return /api\.waslacademy\.net/i.test(url);
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
      return "Ø§Ù„Ù€ API Ù…Ø§ Ø²Ø§Ù„ ÙŠØ·Ù„Ø¨ ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„. Ø§Ù†Ø´Ø± Ù†Ø³Ø®Ø© AllowAnonymous Ù…Ù† /api/demo/livekit/token Ø£ÙˆÙ„Ø§Ù‹.";
    }
    if (status === 0) {
      return "ØªØ¹Ø°Ø± Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ù„Ù€ API (Ø´Ø¨ÙƒØ© Ø£Ùˆ ØªÙˆÙ‚Ù Ø§Ù„Ø®Ø¯Ù…Ø©). ØªØ­Ù‚Ù‚ Ù…Ù† Ù†Ø´Ø± Ø§Ù„Ù…Ø³Ø§Ø± ÙˆØ£Ù† Ø§Ù„Ø®Ø§Ø¯Ù… ÙŠØ¹Ù…Ù„.";
    }
    return `ÙØ´Ù„ Ø·Ù„Ø¨ Ø±Ù…Ø² Ø§Ù„ØºØ±ÙØ© (HTTP ${status}). ØªØ£ÙƒØ¯ Ø£Ù† LiveKit Ù…ÙØ¹Ù‘Ù„ (LiveKit__Enabled=true) ÙˆØ£Ù† Ø§Ù„Ù€ API Ù…Ø¬Ù‡ÙˆÙ„ Ø§Ù„Ù‡ÙˆÙŠØ©.`;
  }

  function formatDisconnectReason(reason, DisconnectReason) {
    if (reason == null) {
      return "Ø³Ø¨Ø¨ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ";
    }

    if (DisconnectReason) {
      if (reason === DisconnectReason.DUPLICATE_IDENTITY || reason === "DUPLICATE_IDENTITY") {
        return "Ù‡ÙˆÙŠØ© Ù…ÙƒØ±Ø±Ø© â€” Ù…ØªØµÙØ­ Ø¢Ø®Ø± Ø¯Ø®Ù„ Ø¨Ù†ÙØ³ Ø§Ù„Ù‡ÙˆÙŠØ©. Ø£Ø¹Ø¯ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… (ØªÙÙ†Ø´Ø£ Ù‡ÙˆÙŠØ© Ø¬Ø¯ÙŠØ¯Ø© Ù„ÙƒÙ„ Ø·Ù„Ø¨).";
      }
      if (reason === DisconnectReason.CLIENT_INITIATED || reason === "CLIENT_INITIATED") {
        return "ØªÙ… Ø§Ù„Ù…ØºØ§Ø¯Ø±Ø© Ù…Ù† Ù‡Ø°Ø§ Ø§Ù„Ù…ØªØµÙØ­.";
      }
      if (reason === DisconnectReason.ROOM_DELETED || reason === "ROOM_DELETED") {
        return "ØªÙ… Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ØºØ±ÙØ©.";
      }
      if (reason === DisconnectReason.JOIN_FAILURE || reason === "JOIN_FAILURE") {
        return "ÙØ´Ù„ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… / Ø´Ø¨ÙƒØ©.";
      }
    }

    return String(reason);
  }
})();


