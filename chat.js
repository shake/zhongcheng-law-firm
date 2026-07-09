// Initialize Clerk SDK on window load
window.addEventListener('load', async () => {
  if (window.Clerk) {
    try {
      await window.Clerk.load();
      console.log('Clerk SDK loaded successfully');
    } catch (err) {
      console.error('Clerk SDK failed to load:', err);
    }
  }
  // Initialize the Chat Room
  initLaborLawChatRoom();
});

function initLaborLawChatRoom() {
  const chatForm = document.getElementById('chat-input-form');
  const chatInputField = document.getElementById('chat-input-field');
  const chatMessages = document.getElementById('chat-messages');
  const logoutBtn = document.getElementById('logout-btn');
  const userStatusSpan = document.querySelector('#chat-user-status .user-email');

  // Auth Modal Elements
  const authModal = document.getElementById('auth-modal');
  const authCloseBtn = document.getElementById('auth-close-btn');
  const authEmailInput = document.getElementById('auth-email');
  const authCodeInput = document.getElementById('auth-code');
  const authGetCodeBtn = document.getElementById('auth-get-code-btn');
  const authVerifyCodeBtn = document.getElementById('auth-verify-code-btn');
  const authBackBtn = document.getElementById('auth-back-btn');
  const authStepEmail = document.getElementById('auth-step-email');
  const authStepCode = document.getElementById('auth-step-code');
  
  const emailFeedback = document.getElementById('auth-email-feedback');
  const codeFeedback = document.getElementById('auth-code-feedback');
  const sentHint = document.getElementById('auth-sent-hint');

  if (!chatForm || !chatInputField || !chatMessages || !authModal) return;

  let signUpAttempt = null;
  let signInAttempt = null;
  let isSignUpFlow = false;
  let targetEmail = '';

  const isUserAuthenticated = () => {
    if (window.Clerk && window.Clerk.user) {
      return true;
    }
    if (localStorage.getItem('mock_user_email')) {
      return true;
    }
    return false;
  };

  const getAuthenticatedEmail = () => {
    if (window.Clerk && window.Clerk.user) {
      return window.Clerk.user.primaryEmailAddress?.emailAddress || 'authenticated_user';
    }
    return localStorage.getItem('mock_user_email') || '';
  };

  const updateHeaderStatus = () => {
    if (isUserAuthenticated()) {
      const email = getAuthenticatedEmail();
      userStatusSpan.innerHTML = `当前登录账户: <strong>${email}</strong>`;
      if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
      }
    } else {
      userStatusSpan.textContent = '未登录';
      if (logoutBtn) {
        logoutBtn.style.display = 'none';
      }
    }
  };

  const checkAccess = () => {
    updateHeaderStatus();
    if (!isUserAuthenticated()) {
      openAuthModal();
    } else {
      // Load bound welcome details
      const email = getAuthenticatedEmail();
      // Update system message
      const systemMsg = chatMessages.querySelector('.system-message');
      if (systemMsg) {
        systemMsg.innerHTML = `
          <h3>欢迎进入劳动法智能研判室</h3>
          <p>您好！您的账户 <strong>${email}</strong> 已验证绑定。您可以向我咨询任何关于试用期长度、加班工资、解除补偿金或社保争议等劳动法相关问题。我将为您检索最新的《中华人民共和国劳动法》及《劳动合同法》条文并进行合规解答。</p>
          <p style="margin-top: 10px; font-size: 0.75rem; color: var(--foreground-muted);">系统已自动挂载最新《劳动法》数据库，您的提问将与您的邮箱安全绑定并仅作学术分析。</p>
        `;
      }
    }
  };

  // Run access check initially
  checkAccess();

  // Logout Action
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('确认退出登录并清空会话状态吗？')) {
        if (window.Clerk && window.Clerk.user) {
          await window.Clerk.signOut();
        }
        localStorage.removeItem('mock_user_email');
        window.location.reload();
      }
    });
  }

  // Close Auth Modal takes user back to home since they cannot use chat without login
  if (authCloseBtn) {
    authCloseBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  // --- Auth Modal Flow Functions ---
  function openAuthModal() {
    authModal.classList.add('active');
    resetAuthModal();
  }

  function closeAuthModal() {
    authModal.classList.remove('active');
  }

  function resetAuthModal() {
    authStepEmail.style.display = 'block';
    authStepCode.style.display = 'none';
    authEmailInput.value = '';
    authCodeInput.value = '';
    emailFeedback.style.display = 'none';
    codeFeedback.style.display = 'none';
    authGetCodeBtn.disabled = false;
    authGetCodeBtn.textContent = '获取邮箱验证码';
    authVerifyCodeBtn.disabled = false;
    authVerifyCodeBtn.textContent = '验证并开启咨询';
  }

  // Get Code
  authGetCodeBtn.addEventListener('click', async () => {
    const email = authEmailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email || !emailRegex.test(email)) {
      emailFeedback.style.display = 'block';
      authEmailInput.focus();
      return;
    }
    emailFeedback.style.display = 'none';
    targetEmail = email;

    authGetCodeBtn.disabled = true;
    authGetCodeBtn.textContent = '正在获取...';

    const useClerk = !!(window.Clerk && window.Clerk.client);

    try {
      if (useClerk) {
        try {
          signInAttempt = await window.Clerk.client.signIn.create({ identifier: email });
          const factor = signInAttempt.supportedFirstFactors.find(f => f.strategy === "email_code");
          await signInAttempt.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
          isSignUpFlow = false;
        } catch (err) {
          if (err.errors && err.errors[0].code === 'form_identifier_not_found') {
            signUpAttempt = await window.Clerk.client.signUp.create({ emailAddress: email });
            await signUpAttempt.prepareEmailAddressVerification();
            isSignUpFlow = true;
          } else {
            throw err;
          }
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200));
        console.log(`[Mock Auth] Code sent to ${email}`);
      }

      sentHint.textContent = `已向您的邮箱 ${email} 发送了验证码，请查收。`;
      authStepEmail.style.display = 'none';
      authStepCode.style.display = 'block';
      authCodeInput.focus();

    } catch (error) {
      console.error('Send verification code error:', error);
      authGetCodeBtn.disabled = false;
      authGetCodeBtn.textContent = '获取邮箱验证码';
      emailFeedback.textContent = error.errors?.[0]?.longMessage || error.message || '获取验证码失败，请重试';
      emailFeedback.style.display = 'block';
    }
  });

  // Verify Code
  authVerifyCodeBtn.addEventListener('click', async () => {
    const code = authCodeInput.value.trim();
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      codeFeedback.textContent = '请输入完整的6位数字验证码';
      codeFeedback.style.display = 'block';
      authCodeInput.focus();
      return;
    }
    codeFeedback.style.display = 'none';

    authVerifyCodeBtn.disabled = true;
    authVerifyCodeBtn.textContent = '校验中...';

    const useClerk = !!(window.Clerk && window.Clerk.client);

    try {
      if (useClerk) {
        let result;
        if (isSignUpFlow) {
          result = await signUpAttempt.attemptEmailAddressVerification({ code });
          if (result.status === "complete") {
            await window.Clerk.setActive({ session: result.createdSessionId });
          } else if (result.status === "missing_requirements") {
            const missing = signUpAttempt.missingFields || [];
            throw new Error(`注册未完成。Clerk 提示缺失必填项: ${missing.join(', ')}。请前往 Clerk 仪表盘关闭这些必填项，或开启无密码验证模式。`);
          } else {
            throw new Error(`Verification status: ${result.status}`);
          }
        } else {
          result = await signInAttempt.attemptFirstFactor({ strategy: "email_code", code });
          if (result.status === "complete") {
            await window.Clerk.setActive({ session: result.createdSessionId });
          } else if (result.status === "missing_requirements") {
            const missing = signInAttempt.missingFields || [];
            throw new Error(`登录未完成。Clerk 提示缺失必填项: ${missing.join(', ')}。`);
          } else {
            throw new Error(`Verification status: ${result.status}`);
          }
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        localStorage.setItem('mock_user_email', targetEmail);
      }

      closeAuthModal();
      checkAccess();

    } catch (error) {
      console.error('Verify code error:', error);
      authVerifyCodeBtn.disabled = false;
      authVerifyCodeBtn.textContent = '验证并开启咨询';
      const clerkErrMsg = error.errors?.[0]?.longMessage || error.errors?.[0]?.message || error.message || '验证码错误或已过期，请重新输入';
      codeFeedback.textContent = clerkErrMsg;
      codeFeedback.style.display = 'block';
    }
  });

  // Back
  authBackBtn.addEventListener('click', () => {
    authStepEmail.style.display = 'block';
    authStepCode.style.display = 'none';
    authCodeInput.value = '';
    codeFeedback.style.display = 'none';
    authGetCodeBtn.disabled = false;
    authGetCodeBtn.textContent = '获取邮箱验证码';
  });

  // Chat Submission
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = chatInputField.value.trim();
    if (!query) return;

    if (!isUserAuthenticated()) {
      openAuthModal();
      return;
    }

    appendChatMessage('user', query);
    chatInputField.value = '';

    const loadingMessageElement = appendChatMessage('loading', '中成律师正在为您检索劳动法条并进行合规研判...');

    try {
      let token = 'dummy-development-token';
      if (window.Clerk && window.Clerk.session) {
        token = await window.Clerk.session.getToken();
      } else {
        const mockPayload = {
          email: getAuthenticatedEmail(),
          exp: Math.floor(Date.now() / 1000) + 3600
        };
        token = `mock-token.${btoa(JSON.stringify(mockPayload))}.signature`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: query })
      });

      loadingMessageElement.remove();

      if (!response.ok) {
        let errText = '请求失败';
        try {
          const errJson = await response.json();
          errText = errJson.error || errText;
        } catch {
          errText = await response.text();
        }
        appendChatMessage('ai', `⚠️ 研判失败：${errText}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      const aiMessageElement = appendChatMessage('ai', '');
      let fullResponseText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullResponseText += chunk;

        aiMessageElement.innerHTML = formatMarkdown(fullResponseText);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

    } catch (error) {
      if (loadingMessageElement) loadingMessageElement.remove();
      appendChatMessage('ai', `⚠️ 网络连接错误：${error.message}`);
    }
  });

  function appendChatMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}-message`;
    msgDiv.innerHTML = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  function formatMarkdown(text) {
    let html = text;
    html = html.replace(/###\s+(.*?)(?=\n|$)/g, '<h4>$1</h4>');
    html = html.replace(/##\s+(.*?)(?=\n|$)/g, '<h3>$1</h3>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*-\s+(.*?)(?=\n|$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
    html = html.split('\n\n').map(p => {
      p = p.trim();
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<li')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    return html;
  }
}
