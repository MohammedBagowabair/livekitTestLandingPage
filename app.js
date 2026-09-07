(() => {
  const LivekitClient = window.LivekitClient;
  if (!LivekitClient) {
    setStatus("تعذر تحميل مكتبة LiveKit. تحقق من الاتصال بالإنترنت.", true);
    return;
  }

  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  const displayNameInput = document.getElementById("displayName");
  const roomNameInput = document.getElementById("roomName");
  const enableCameraInput = document.getElementById("enableCamera");
  const joinBtn = document.getElementById("joinBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const suggestRoomBtn = document.getElementById("suggestRoomBtn");
  const enableCameraBtn = document.getElementById("enableCameraBtn");
  const statusEl = document.getElementById("status");
  const stage = document.getElementById("stage");
  const localVideo = document.getElementById("localVideo");
  const localLabel = document.getElementById("localLabel");
  const remoteGrid = document.getElementById("remoteGrid");

  const storageKey = "wasl-livekit-demo-v3-anon";
  const defaultApiBaseUrl = "https://api.waslacademy.net";
  const clientInstanceId =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `inst-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  /** @type {import('livekit-client').Room | null} */
  let room = null;

  restoreForm();
  setStatus(
    "جاهز. لا حاجة لـ JWT — أدخل اسم الغرفة واسمك ثم انضم (يتطلب API مجهول + LiveKit مفعّل).",
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
  enableCameraBtn.addEventListener("click", () => {
    void enableCameraNow();
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

      const { Room, RoomEvent, Track, DisconnectReason } = LivekitClient;
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
        .on(RoomEvent.Disconnected, (reason) => {
          const reasonText = formatDisconnectReason(reason, DisconnectReason);
          setStatus(`تم قطع الاتصال: ${reasonText}`, true);
          room = null;
          resetStage();
          setBusy(false);
        });

      await room.connect(payload.url, payload.token);

      localLabel.textContent = `${displayName} (${payload.identity || room.localParticipant.identity})`;
      stage.hidden = false;
      leaveBtn.disabled = false;
      joinBtn.disabled = true;
      enableCameraBtn.disabled = false;

      let mediaWarning = "";
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micError) {
        console.warn(micError);
        mediaWarning += "تعذر تشغيل الميكروفون. ";
      }

      if (wantCamera) {
        try {
          await room.localParticipant.setCameraEnabled(true);
          attachLocalCamera(Track);
        } catch (cameraError) {
          console.warn(cameraError);
          mediaWarning +=
            "تعذر تشغيل الكاميرا على هذا الجهاز (غالباً مستخدمة في المتصفح الآخر). يمكنك البقاء بالصوت فقط. ";
        }
      }

      const remoteCount = room.remoteParticipants.size;
      const base =
        `متصل كهوية ${payload.identity}. مشاركون آخرون الآن: ${remoteCount}. ` +
        "في كل متصفح: نفس اسم الغرفة، أسماء عرض مختلفة.";

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

  async function enableCameraNow() {
    if (!room) {
      setStatus("انضم للجلسة أولاً.", true);
      return;
    }

    try {
      await room.localParticipant.setCameraEnabled(true);
      const { Track } = LivekitClient;
      attachLocalCamera(Track);
      setStatus("تم تشغيل الكاميرا.", false, true);
    } catch (error) {
      console.warn(error);
      setStatus(
        "تعذر تشغيل الكاميرا. على نفس الجهاز غالباً متصفح واحد فقط يستطيع استخدام الكاميرا.",
        true
      );
    }
  }

  function attachLocalCamera(Track) {
    const camPub = [...room.localParticipant.trackPublications.values()].find(
      (p) => p.track && p.track.kind === Track.Kind.Video
    );
    if (camPub?.track) {
      camPub.track.attach(localVideo);
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
    const identityKey = String(participant.identity || "").replace(/"/g, "");
    let tile = remoteGrid.querySelector(`[data-identity="${identityKey}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "tile remote";
      tile.dataset.identity = identityKey;

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
    enableCameraBtn.disabled = true;
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
      return "الـ API ما زال يطلب تسجيل دخول. انشر نسخة AllowAnonymous من /api/demo/livekit/token أولاً.";
    }
    if (status === 0) {
      return "تعذر الوصول للـ API (شبكة أو توقف الخدمة). تحقق من نشر المسار وأن الخادم يعمل.";
    }
    return `فشل طلب رمز الغرفة (HTTP ${status}). تأكد أن LiveKit مفعّل (LiveKit__Enabled=true) وأن الـ API مجهول الهوية.`;
  }

  function formatDisconnectReason(reason, DisconnectReason) {
    if (reason == null) {
      return "سبب غير معروف";
    }

    if (DisconnectReason) {
      if (reason === DisconnectReason.DUPLICATE_IDENTITY || reason === "DUPLICATE_IDENTITY") {
        return "هوية مكررة — متصفح آخر دخل بنفس الهوية. أعد الانضمام (تُنشأ هوية جديدة لكل طلب).";
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
