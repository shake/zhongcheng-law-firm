/**
 * ZHONGCHENG LAW FIRM (贵阳中成律师事务所) - CLIENT-SIDE LOGIC
 * Editorial Grid / Magazine Interactions, Scroll Reveal, Testimonials Slider, and Form Validation
 */

document.addEventListener('DOMContentLoaded', () => {
  initHeaderScroll();
  initMobileMenu();
  initScrollReveal();
  initNumericalCounters();
  initTestimonialsSlider();
  initFormValidation();
  initPracticeModals();
  initLegalCalculator();
  initFaqAccordion();
  initBreakingTicker();
  initLaborLawChat();
});

/**
 * 1. Header Scroll Adaptation
 */
function initHeaderScroll() {
  const header = document.getElementById('main-header');
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
      header.style.backgroundColor = 'var(--background-alt)';
    } else {
      header.classList.remove('scrolled');
      header.style.backgroundColor = 'var(--background)';
    }
  };

  window.addEventListener('scroll', handleScroll);
  handleScroll();
}

/**
 * 2. Mobile Navigation Overlay
 */
function initMobileMenu() {
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const mobileNav = document.getElementById('mobile-nav-menu');
  const mobileLinks = mobileNav ? mobileNav.querySelectorAll('.nav-link') : [];

  if (!mobileToggle || !mobileNav) return;

  const toggleMenu = () => {
    const isOpen = mobileNav.classList.toggle('open');
    mobileToggle.setAttribute('aria-expanded', isOpen);
    
    // Animate hamburger to X
    const spans = mobileToggle.querySelectorAll('span');
    if (isOpen) {
      spans[0].style.transform = 'translateY(7px) rotate(45deg)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
      spans[0].style.backgroundColor = 'var(--accent)';
      spans[2].style.backgroundColor = 'var(--accent)';
    } else {
      spans[0].style.transform = 'none';
      spans[1].style.opacity = '1';
      spans[2].style.transform = 'none';
      spans[0].style.backgroundColor = 'var(--primary)';
      spans[2].style.backgroundColor = 'var(--primary)';
    }
  };

  mobileToggle.addEventListener('click', toggleMenu);
  
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (mobileNav.classList.contains('open')) {
        toggleMenu();
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (mobileNav.classList.contains('open') && 
        !mobileNav.contains(e.target) && 
        !mobileToggle.contains(e.target)) {
      toggleMenu();
    }
  });
}

/**
 * 3. Scroll Reveal Animation
 */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length === 0) return;

  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  reveals.forEach(element => {
    observer.observe(element);
  });
}

/**
 * 4. Animated Numerical Counters (Stats)
 */
function initNumericalCounters() {
  const counters = document.querySelectorAll('.counter');
  const statsSection = document.getElementById('stats');
  if (counters.length === 0 || !statsSection) return;

  let animated = false;

  const animateCounters = () => {
    counters.forEach(counter => {
      const target = +counter.getAttribute('data-target');
      const duration = 2000;
      const stepTime = Math.max(Math.floor(duration / target), 10);
      let current = 0;

      const timer = setInterval(() => {
        current += Math.ceil(target / (duration / stepTime));
        if (current >= target) {
          counter.textContent = target;
          clearInterval(timer);
        } else {
          counter.textContent = current;
        }
      }, stepTime);
    });
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !animated) {
        animateCounters();
        animated = true;
        observer.unobserve(statsSection);
      }
    });
  }, { threshold: 0.15 });

  observer.observe(statsSection);
}

/**
 * 5. Testimonials Slider / Carousel
 */
function initTestimonialsSlider() {
  const track = document.getElementById('testimonial-track');
  const indicators = document.querySelectorAll('.indicator-dot');
  if (!track || indicators.length === 0) return;

  let currentIndex = 0;
  const slideCount = indicators.length;
  let slideInterval;

  const goToSlide = (index) => {
    currentIndex = index;
    track.style.transform = `translateX(-${index * 100}%)`;
    
    indicators.forEach(ind => ind.classList.remove('active'));
    indicators[index].classList.add('active');
  };

  const startAutoSlide = () => {
    slideInterval = setInterval(() => {
      let nextIndex = (currentIndex + 1) % slideCount;
      goToSlide(nextIndex);
    }, 6000);
  };

  const stopAutoSlide = () => {
    clearInterval(slideInterval);
  };

  indicators.forEach(indicator => {
    indicator.addEventListener('click', (e) => {
      stopAutoSlide();
      const index = parseInt(e.target.getAttribute('data-index'));
      goToSlide(index);
      startAutoSlide();
    });
  });

  startAutoSlide();

  track.addEventListener('mouseenter', stopAutoSlide);
  track.addEventListener('mouseleave', startAutoSlide);
}

/**
 * 6. Consultation Form Client-Side Validation & Submission
 */
function initFormValidation() {
  const form = document.getElementById('consultation-form');
  if (!form) return;

  const nameInput = document.getElementById('contact-name');
  const phoneInput = document.getElementById('contact-phone');
  const areaSelect = document.getElementById('contact-area');
  const messageInput = document.getElementById('contact-message');

  const setError = (inputElement, hasError) => {
    const group = inputElement.closest('.form-group');
    if (!group) return;

    if (hasError) {
      group.classList.add('has-error');
    } else {
      group.classList.remove('has-error');
    }
  };

  const validateField = (inputElement, validatorFn) => {
    const isValid = validatorFn(inputElement.value);
    setError(inputElement, !isValid);
    return isValid;
  };

  // Validators
  const isNotEmpty = val => val.trim().length > 0;
  const isValidPhone = val => {
    const cleaned = val.replace(/[-\s]/g, '');
    return /^1[3-9]\d{9}$/.test(cleaned) || /^\d{7,15}$/.test(cleaned);
  };

  nameInput.addEventListener('input', () => validateField(nameInput, isNotEmpty));
  phoneInput.addEventListener('input', () => validateField(phoneInput, isValidPhone));
  areaSelect.addEventListener('change', () => validateField(areaSelect, isNotEmpty));
  messageInput.addEventListener('input', () => validateField(messageInput, isNotEmpty));

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const isNameValid = validateField(nameInput, isNotEmpty);
    const isPhoneValid = validateField(phoneInput, isValidPhone);
    const isAreaValid = validateField(areaSelect, isNotEmpty);
    const isMessageValid = validateField(messageInput, isNotEmpty);

    const isFormValid = isNameValid && isPhoneValid && isAreaValid && isMessageValid;

    if (isFormValid) {
      const submitBtn = document.getElementById('submit-form-btn');
      const originalText = submitBtn.textContent;
      
      submitBtn.disabled = true;
      submitBtn.textContent = '登记专访中 / CONNECTING...';

      setTimeout(() => {
        showSuccessMessage(form, nameInput.value);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        form.reset();
      }, 1200);
    } else {
      const firstError = form.querySelector('.has-error .form-control');
      if (firstError) firstError.focus();
    }
  });
}

/**
 * Show a clean print-inspired success box with double outlines inside coupon frame
 */
function showSuccessMessage(formElement, clientName) {
  const container = formElement.parentElement;
  const originalHTML = container.innerHTML;

  container.innerHTML = `
    <!-- Re-render the coupon outline frame as a receipt -->
    <div style="text-align: left; display: flex; flex-direction: column; gap: var(--space-md);">
      <span class="coupon-scissors scissors-top-left" style="top: -14px; left: 15px;">✂</span>
      <span class="coupon-scissors scissors-top-right" style="top: -14px; right: 15px;">✂</span>
      <span class="coupon-scissors scissors-bottom-right" style="bottom: -14px; right: 15px;">✂</span>
      <span class="coupon-scissors scissors-bottom-left" style="bottom: -14px; left: 15px;">✂</span>
      
      <div class="official-seal" aria-hidden="true" style="opacity: 0.85;"></div>

      <div style="width: 50px; height: 50px; background-color: var(--success); color: #ffffff; display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-xs);">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h3 style="font-size: 1.6rem; color: var(--primary); font-family: var(--font-serif); font-weight: 900;">专访申请回执凭证</h3>
      <p style="font-size: 0.95rem; line-height: 1.7; color: var(--foreground-muted); max-width: 440px;">
        尊敬的 <strong>${clientName}</strong>，我们已正式签收并归档您的咨询。中成律所主任办公室助理团队将在 <strong>30分钟内</strong> 致电与您确认时间，并对接相应专栏的执业合伙人律师进行首诊法理研判。
      </p>
      
      <div class="coupon-signature-block" style="justify-content: flex-start; margin-top: var(--space-sm);">
        <span>中成学术审阅委员会:</span>
        <div class="signature-line" style="border-bottom-style: double; width: 120px; text-align: center; color: var(--accent); font-family: var(--font-serif); font-size: 0.9rem; line-height: 12px;">陈中成 印</div>
      </div>
      
      <button id="reset-success-btn" class="btn btn-primary" style="margin-top: var(--space-sm); align-self: flex-start;">返回预约登记</button>
    </div>
  `;

  document.getElementById('reset-success-btn').addEventListener('click', () => {
    container.innerHTML = originalHTML;
    initFormValidation();
  });
}

/**
 * 7. Practice Detail Modals / Drawers Logic
 */
function initPracticeModals() {
  const modal = document.getElementById('practice-detail-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const bookBtn = document.getElementById('modal-book-btn');
  const triggers = document.querySelectorAll('.open-practice-modal');

  if (!modal) return;

  const practiceData = {
    corporate: {
      title: "大数据与电子信息合规",
      subtitle: "大数据与信息专栏",
      leader: "李华颖 律师 (武汉大学法学博士，执业 18 年)",
      overview: "为大数据平台、数据交易中心提供数据资产确权、合规审计、敏感数据去隐私化处理。特别关注在数据要素化流通、公共数据确权授权运营以及大模型语料流通中的穿透式安全审查与风控保障。",
      cases: [
        { name: "某云服务平台公共数据授权运营与确权合规案", desc: "主导搭建其底层数据安全自查架构，并成功协助通过数据确权专项合规审计评估。" },
        { name: "西部首例智慧交通多维脱敏数据跨境交易纠纷案", desc: "在省市两级监管穿透评估下，主导设计合规免责证明与抗辩案卷，促成双方和解。" }
      ]
    },
    ip: {
      title: "矿产资源与新能源开发",
      subtitle: "矿产与新能源专栏",
      leader: "陈中成 律师 (西南政法大学法学硕士，执业 25 年)",
      overview: "专注于矿产资源探矿权采矿权出让转让、绿色矿山建设、新能源电池制造产业链以及生态环境合规评估。化解探采权与自然保护地红线交叉所引起的合同与行政交织的疑难民商事纠纷。",
      cases: [
        { name: "某大型国有铜矿与林地重叠采矿权林业行政诉讼案", desc: "代理民营及国有矿业集团成功完成林地占用与生态红线穿透性审查，撤销行政不予审批决定，恢复正常开采。" },
        { name: "某新能源动力电池梯次利用项目环保侵权索赔应诉案", desc: "设计全链条电池流向追溯抗辩证据，在省高院二审中大幅缩减原告环境侵权索赔金额逾90%。" }
      ]
    },
    litigation: {
      title: "复杂民商事争议与仲裁",
      subtitle: "民商争议专栏",
      leader: "王克坚 律师 (西南政法大学法学硕士，执业 20 年)",
      overview: "代理特大额合同违约、建设工程合同纠纷、公司实际控制人股权质押诉讼、以及西南区多边商事仲裁。提倡“案卷法律关系穿透式解构”，在错综复杂的民商事纠纷中，为客户定制防线并寻求最优解法。",
      cases: [
        { name: "某百亿房企建设工程连带清偿与大额票据追索案", desc: "在合同关系严重混同的情况下出庭辩护，成功隔离连带债务责任，免除逾3亿元连带清偿赔偿责任。" },
        { name: "某集团矿山股权回购条款违约贵阳仲裁委应裁案", desc: "代表被申请人以商业情势变更及合同对价穿透进行抗辩，裁决结果免予支付巨额违约金并驳回索赔。" }
      ]
    },
    foreign: {
      title: "政府法律顾问与行政诉讼",
      subtitle: "政府法顾专栏",
      leader: "陈中成 律师 / 行政法顾问团队",
      overview: "担任省市多级政府及城投平台的常年法律顾问。主导地方政府重大项目合规性论证、城建PPP项目清退谈判，并代理复杂的行政协议履行纠纷、国家赔偿应诉等。",
      cases: [
        { name: "某地级市政府重大招商引资框架协议退出谈判案", desc: "协助政府依法解除涉及20亿投资的行政协议，规避国家行政赔偿风险，实现政企纠纷无损退出。" },
        { name: "某城投平台工程款超付退回行政再审应诉案", desc: "成功向省高级人民法院申请再审并改判，确认行政超付退款法律效力，追回流失的国有资产。" }
      ]
    },
    wealth: {
      title: "重大商事与股权并购",
      subtitle: "商事并购专栏",
      leader: "王克坚 律师 / 混改与并购顾问组",
      overview: "为地方国有企业混合所有制改制、国有平台并购重组提供方案设计、战略投资方引入。为主流民营实体、成长型财团主导股权资产收购、交易架构拆分及全面资产尽职调查与合规保障。",
      cases: [
        { name: "某省属大型物资集团混改股权拆分与持股计划", desc: "设计符合国资监管的混改股权分配机制，顺利通过省国资委穿透审计与合规评估，平稳落地。" },
        { name: "某知名民营制药企业大额股权并购专项调查重组", desc: "主导并购尽职调查，排查并化解多项账外隐性担保及未披露诉讼风险，设计安全回扣交易架构。" }
      ]
    },
    compliance: {
      title: "破产清算与困境资产处置",
      subtitle: "破产重组专栏",
      leader: "李华颖 律师 / 破产管理人办公室",
      overview: "担任各级人民法院指定的破产重整与清算管理人。专注于困境房企破产资产清偿、大中型国企实质合并破产重整、金融债务链条断裂下的优先债权保护及重整招募等。",
      cases: [
        { name: "某省属百亿负债大型钢贸企业合并破产重整案", desc: "作为联合管理人主导招募战略投资者，债权总额达120亿元，成功通过重整计划草案，实现企业重生。" },
        { name: "某贵阳本地知名商业地产大盘加急破产重整案", desc: "历时11个月，理顺工程款优先受偿权及购房户消费性权益，引入续建投资，实现盘活交付。" }
      ]
    }
  };

  let currentCategory = '';

  const openModal = (category) => {
    const data = practiceData[category];
    if (!data) return;

    currentCategory = category;
    document.getElementById('modal-subtitle').textContent = data.subtitle;
    document.getElementById('modal-title').textContent = data.title;
    document.getElementById('modal-overview').textContent = data.overview;
    document.getElementById('modal-leader').textContent = data.leader;

    const casesList = document.getElementById('modal-cases-list');
    casesList.innerHTML = '';
    
    data.cases.forEach(c => {
      const caseItem = document.createElement('div');
      caseItem.className = 'modal-case-item';
      caseItem.innerHTML = `
        <div class="modal-case-name">✔ ${c.name}</div>
        <div class="modal-case-desc">${c.desc}</div>
      `;
      casesList.appendChild(caseItem);
    });

    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevents background scroll
  };

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      const category = trigger.getAttribute('data-practice');
      openModal(category);
    });
  });

  const closeElements = [closeBtn, cancelBtn];
  closeElements.forEach(btn => {
    if (btn) btn.addEventListener('click', closeModal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  if (bookBtn) {
    bookBtn.addEventListener('click', () => {
      closeModal();
      
      // Auto select the practice area in contact form
      const areaSelect = document.getElementById('contact-area');
      if (areaSelect && currentCategory) {
        areaSelect.value = currentCategory;
        // Trigger select change validation
        const event = new Event('change');
        areaSelect.dispatchEvent(event);
      }

      // Pre-fill prompt template in message box
      const messageInput = document.getElementById('contact-message');
      if (messageInput && currentCategory) {
        const data = practiceData[currentCategory];
        messageInput.value = `【专栏预约研判】\n意向专栏：${data.title}\n首诊合伙人：${data.leader}\n\n具体咨询事实陈述：\n`;
        messageInput.focus();
        // Trigger input event for validation
        const event = new Event('input');
        messageInput.dispatchEvent(event);
      }

      // Scroll to form smoothly
      const contactSection = document.getElementById('contact');
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

/**
 * 8. Interactive Fee & Risk Calculator Logic
 */
function initLegalCalculator() {
  const categorySelect = document.getElementById('calc-category');
  const amountSlider = document.getElementById('calc-amount');
  const sliderDisplay = document.getElementById('slider-val-display');
  const radioButtons = document.querySelectorAll('.radio-tile-btn');
  const riskDisplay = document.getElementById('calc-risk-level');
  const strategyDisplay = document.getElementById('calc-strategy');
  const feeDisplay = document.getElementById('calc-fee-display');
  const exportBtn = document.getElementById('calc-export-btn');

  if (!categorySelect || !amountSlider) return;

  const dataMapping = {
    corporate: { multiplier: 1.2, strategy: { normal: "数据确权日常合规审计", urgent: "电子资产交易加急风控", critical: "数据跨境安全自查及应急评估" } },
    ip: { multiplier: 1.5, strategy: { normal: "探矿权采矿权行政核查", urgent: "林地环保诉前纠纷保全", critical: "生态地交叉突击环保应诉" } },
    litigation: { multiplier: 1.8, strategy: { normal: "案卷法律关系穿透式解构", urgent: "大额债务连带保全与诉前提诉", critical: "重大商事合同违约加急仲裁应裁" } },
    foreign: { multiplier: 2.0, strategy: { normal: "日常重大项目合规性核对", urgent: "PPP项目清退纠纷紧急应诉", critical: "重大行政许可裁决听证应诉" } },
    wealth: { multiplier: 1.0, strategy: { normal: "资产尽调及重组方案论证", urgent: "国有股权混改方案评估", critical: "股权并购隐性担保责任抗辩" } },
    compliance: { multiplier: 1.6, strategy: { normal: "破产前置债权受偿分类", urgent: "企业重整谈判与管理人指定", critical: "特大债权断裂困境资产隔离重组" } }
  };

  const getSelectedUrgency = () => {
    let val = 'normal';
    radioButtons.forEach(btn => {
      if (btn.classList.contains('selected')) {
        val = btn.getAttribute('data-value');
      }
    });
    return val;
  };

  const recalculate = () => {
    const category = categorySelect.value;
    const amountVal = +amountSlider.value; // in 万元
    const urgency = getSelectedUrgency();

    const config = dataMapping[category];
    if (!config) return;

    // Display formatted amount
    let amountText = amountVal + " 万元";
    if (amountVal >= 10000) {
      amountText = "1 亿元以上 (特大型项目)";
    }
    sliderDisplay.textContent = amountText;

    // Urgency multipliers and Risk Grading
    let urgencyFactor = 1.0;
    if (urgency === 'urgent') urgencyFactor = 1.35;
    if (urgency === 'critical') urgencyFactor = 1.65;

    let riskText = "常规风险 / 一般风控研判";
    let riskClass = "risk-low";

    if (urgency === 'critical' || amountVal >= 5000) {
      riskText = "特大风险 / 高度监管防备";
      riskClass = "risk-high";
    } else if (urgency === 'urgent' || amountVal >= 1500) {
      riskText = "中等风险 / 关注抗辩合规";
      riskClass = "risk-mid";
    }

    riskDisplay.textContent = riskText;
    riskDisplay.className = `calc-result-val ${riskClass}`;

    // Strategy
    strategyDisplay.textContent = config.strategy[urgency];

    // Fee calculation
    // Base fee is proportional to amount and multiplier
    const rawBaseMin = amountVal * config.multiplier * 0.015 * urgencyFactor;
    const rawBaseMax = amountVal * config.multiplier * 0.04 * urgencyFactor;

    let feeMin = Math.round(rawBaseMin);
    let feeMax = Math.round(rawBaseMax);

    // Apply minimum fee caps
    if (feeMin < 3) feeMin = 3;
    if (feeMax < 8) feeMax = 8;
    if (feeMax <= feeMin) feeMax = feeMin + 5;

    // Format output
    feeDisplay.textContent = `${feeMin} - ${feeMax} 万元`;
  };

  // Event Listeners
  categorySelect.addEventListener('change', recalculate);
  amountSlider.addEventListener('input', recalculate);

  radioButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      radioButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const radioInput = btn.querySelector('input');
      if (radioInput) radioInput.checked = true;
      recalculate();
    });
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const category = categorySelect.value;
      const amountVal = +amountSlider.value;
      const urgency = getSelectedUrgency();
      const riskText = riskDisplay.textContent;
      const strategyText = strategyDisplay.textContent;
      const feeText = feeDisplay.textContent;

      // Select option in main form
      const areaSelect = document.getElementById('contact-area');
      if (areaSelect) {
        areaSelect.value = category;
        const changeEvent = new Event('change');
        areaSelect.dispatchEvent(changeEvent);
      }

      // Format template message
      let amountText = amountVal + " 万元";
      if (amountVal >= 10000) amountText = "1 亿元以上";

      let urgencyText = "常规研判";
      if (urgency === 'urgent') urgencyText = "加急诉前/答辩";
      if (urgency === 'critical') urgencyText = "突发监管调查";

      const messageInput = document.getElementById('contact-message');
      if (messageInput) {
        messageInput.value = `【首诊合规与聘请费研判数据】
涉及专栏：${categorySelect.options[categorySelect.selectedIndex].text}
涉及金额：${amountText}
紧急程度：${urgencyText}
风险判级：${riskText}
建议方案：${strategyText}
聘请费预估：${feeText}

【具体事实陈述】：
（请在此处写下您的项目/案情背景、纠纷概况与诉求，中成律所承诺对该信息实施红墙密级脱敏并严格保密）`;
        
        messageInput.focus();
        const inputEvent = new Event('input');
        messageInput.dispatchEvent(inputEvent);
      }

      // Scroll smoothly to contact form
      const contactSection = document.getElementById('contact');
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Initial Calculation
  recalculate();
}

/**
 * 9. Editorial FAQ Accordion Logic
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (faqItems.length === 0) return;

  faqItems.forEach(item => {
    const header = item.querySelector('.faq-header');
    if (!header) return;

    header.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      
      // Close all other items (Single-Open behavior)
      faqItems.forEach(otherItem => {
        otherItem.classList.remove('active');
      });

      // If it wasn't active, open it
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

/**
 * 10. Loads Ticker News dynamically from news.json
 */
function initBreakingTicker() {
  const tickerScroll = document.querySelector('.ticker-scroll');
  if (!tickerScroll) return;

  fetch('news.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data) || data.length === 0) return;

      // Clear existing fallback items
      tickerScroll.innerHTML = '';

      // Generate HTML items from JSON
      const itemsHtml = data.map(item => {
        return `<div class="ticker-item"><span>[${item.tag}]</span>${item.content}</div>`;
      }).join('');

      // Repeat items twice for infinite loop marquee CSS animation
      tickerScroll.innerHTML = itemsHtml + itemsHtml;
    })
    .catch(error => {
      console.error('Error loading news.json:', error);
      // Keeps original fallback static HTML items in case of fetch error (e.g. file:// protocol)
    });
}

/**
 * 11. Labor Law AI Q&A Chat Widget Interaction
 */
function initLaborLawChat() {
  const bubbleBtn = document.getElementById('chat-bubble-btn');
  const chatWindow = document.getElementById('chat-window');
  const closeBtn = document.getElementById('chat-close-btn');
  const chatForm = document.getElementById('chat-input-form');
  const chatInputField = document.getElementById('chat-input-field');
  const chatMessages = document.getElementById('chat-messages');

  if (!bubbleBtn || !chatWindow || !chatForm || !chatInputField || !chatMessages) return;

  // Toggle Chat window open/close
  bubbleBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('active');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      chatWindow.classList.remove('active');
    });
  }

  // Handle Form Submission
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = chatInputField.value.trim();
    if (!query) return;

    // Append User Message to UI
    appendChatMessage('user', query);
    chatInputField.value = '';

    // Show Loading Skeleton
    const loadingMessageElement = appendChatMessage('loading', '中成律师正在为您检索劳动法条并进行合规研判...');

    try {
      // Retrieve Clerk Token if Clerk is initialized, otherwise use developer dummy token
      let token = 'dummy-development-token';
      if (window.Clerk && window.Clerk.session) {
        token = await window.Clerk.session.getToken();
      }

      // Call Streaming Chat API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: query })
      });

      // Remove loading message
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

      // Stream Reader
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      // Append an empty AI message block to fill in dynamically
      const aiMessageElement = appendChatMessage('ai', '');
      let fullResponseText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullResponseText += chunk;

        // Render formatted HTML (simple markdown to HTML conversion)
        aiMessageElement.innerHTML = formatMarkdown(fullResponseText);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

    } catch (error) {
      if (loadingMessageElement) loadingMessageElement.remove();
      appendChatMessage('ai', `⚠️ 网络连接错误：${error.message}`);
    }
  });

  // Helper to append message bubble to UI
  function appendChatMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}-message`;
    msgDiv.innerHTML = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  // Simple RegExp Markdown Parser for Edge clients
  function formatMarkdown(text) {
    let html = text;
    // Replace Headings: ### title and ## title
    html = html.replace(/###\s+(.*?)(?=\n|$)/g, '<h4>$1</h4>');
    html = html.replace(/##\s+(.*?)(?=\n|$)/g, '<h3>$1</h3>');
    // Replace Bold: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Replace Bullet Lists: - item
    html = html.replace(/^\s*-\s+(.*?)(?=\n|$)/gm, '<li>$1</li>');
    // Wrap lists in <ul> tags (simple pass)
    html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
    // Replace Paragraphs (split by double newlines)
    html = html.split('\n\n').map(p => {
      p = p.trim();
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<li')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  }
}
