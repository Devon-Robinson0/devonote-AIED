const MAX_TOPIC_NAME_LENGTH = 36;
const MAX_PAGE_NAME_LENGTH = 36;
const DEFAULT_TOPIC_NAME = 'New Topic';

const PAGE_TYPE_NAMES = {
  tab: 'New Tab',
  document: 'New Document',
  code: 'New Code'
};

const PAGE_TYPE_MARKERS = {
  tab: 'T',
  document: 'D',
  code: 'C'
};

const DROP_TARGET_SWITCH_THRESHOLD = 8;

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarContent = document.getElementById('sidebarContent');
const topicsView = document.getElementById('topicsView');
const topicsToggle = document.getElementById('topicsToggle');
const addTopicButton = document.getElementById('addTopicButton');
const topicList = document.getElementById('topicList');
const topicDetailTitle = document.getElementById('topicDetailTitle');
const backTopicButton = document.getElementById('backTopicButton');
const pageList = document.getElementById('pageList');
const addPageButton = document.getElementById('addPageButton');
const addPagePopup = document.getElementById('addPagePopup');
const contextMenu = document.getElementById('topicContextMenu');
const renameTopicButton = document.getElementById('renameTopicButton');
const deleteTopicButton = document.getElementById('deleteTopicButton');
const deleteTopicModal = document.getElementById('deleteTopicModal');
const deleteModalTitle = document.getElementById('deleteModalTitle');
const deleteModalMessage = document.getElementById('deleteModalMessage');
const cancelDeleteButton = document.getElementById('cancelDeleteButton');
const confirmDeleteButton = document.getElementById('confirmDeleteButton');

let topicIdCounter = 0;
let pageIdCounter = 0;
let selectedTopicId = null;
let selectedPageId = null;
let currentTopicId = null;
let contextTarget = null;
let deleteTarget = null;
let addPageParentTabId = null;
let dragState = null;
let dropTarget = null;
let activeDropKey = null;
let activeDropDistance = Infinity;
let topics = [];

const topicDropIndicator = document.createElement('div');
const pageDropIndicator = document.createElement('div');

topicDropIndicator.className = 'drop-indicator';
pageDropIndicator.className = 'drop-indicator';
sidebarContent.dataset.view = 'topics';

sidebarToggle.addEventListener('click', toggleSidebar);
topicsToggle.addEventListener('click', toggleTopicsSubmenu);
addTopicButton.addEventListener('click', createTopic);
backTopicButton.addEventListener('click', exitTopic);
addPageButton.addEventListener('click', (event) => openAddPagePopup(event.currentTarget, null));
renameTopicButton.addEventListener('click', handleContextRename);
deleteTopicButton.addEventListener('click', handleContextDelete);
cancelDeleteButton.addEventListener('click', closeDeleteTopicModal);
confirmDeleteButton.addEventListener('click', confirmDeleteTopic);
deleteTopicModal.addEventListener('click', (event) => {
  if (event.target === deleteTopicModal) {
    closeDeleteTopicModal();
  }
});
addPagePopup.addEventListener('click', (event) => {
  const option = event.target.closest('[data-page-type]');

  if (option) {
    createPage(option.dataset.pageType, addPageParentTabId);
  }
});

topicList.addEventListener('dragover', (event) => {
  if (dragState?.type !== 'topic') {
    return;
  }

  event.preventDefault();
  handleTopicDragOver(event, null);
});
topicList.addEventListener('drop', (event) => {
  if (dragState?.type !== 'topic') {
    return;
  }

  handleTopicDrop(event, dropTarget?.index ?? topics.length);
});

pageList.addEventListener('dragover', (event) => {
  if (dragState?.type !== 'page') {
    return;
  }

  event.preventDefault();
  handlePageDragOver(event, {
    mode: 'insert',
    parentTabId: null,
    index: findTopic(currentTopicId)?.pages.length ?? 0
  });
});
pageList.addEventListener('drop', (event) => {
  if (dragState?.type !== 'page') {
    return;
  }

  handlePageDrop(event, dropTarget || {
    parentTabId: null,
    index: findTopic(currentTopicId)?.pages.length ?? 0
  });
});

document.addEventListener('click', (event) => {
  if (!contextMenu.contains(event.target)) {
    hideContextMenu();
  }

  if (!addPagePopup.contains(event.target) && !event.target.closest('.add-page-button, .tab-add-button')) {
    closeAddPagePopup();
  }
});

document.addEventListener('keydown', (event) => {
  if (isDeleteModalOpen()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDeleteTopicModal();
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      confirmDeleteTopic();
    }

    return;
  }

  if (event.key === 'Escape') {
    hideContextMenu();
    closeAddPagePopup();
  }
});

window.addEventListener('resize', () => {
  hideContextMenu();
  closeAddPagePopup();
});

renderTopics();
requestAnimationFrame(() => {
  document.body.classList.remove('no-transition');
});

function toggleSidebar() {
  const isCollapsed = sidebar.classList.toggle('is-collapsed');

  document.body.classList.toggle('sidebar-collapsed', isCollapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
  sidebarToggle.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  hideContextMenu();
  closeAddPagePopup();
}

function toggleTopicsSubmenu() {
  const isClosed = topicsView.classList.toggle('is-closed');

  topicsToggle.setAttribute('aria-expanded', String(!isClosed));
  topicList.inert = isClosed;
  topicList.setAttribute('aria-hidden', String(isClosed));
  updateDropdownAnimation(topicList, !isClosed, true);
  hideContextMenu();
}

function createTopic() {
  if (sidebar.classList.contains('is-collapsed')) {
    toggleSidebar();
  }

  if (currentTopicId !== null) {
    exitTopic();
  }

  if (topicsView.classList.contains('is-closed')) {
    toggleTopicsSubmenu();
  }

  topicIdCounter += 1;

  const topic = {
    id: topicIdCounter,
    name: DEFAULT_TOPIC_NAME,
    pages: []
  };

  topics.push(topic);
  selectedTopicId = topic.id;
  renderTopics();
  refreshOpenDropdowns();
  renameTopic(getTopicRow(topic.id));
}

function renderTopics() {
  topicList.replaceChildren();

  topics.forEach((topic) => {
    topicList.appendChild(createTopicRow(topic));
  });

  refreshOpenDropdowns();
}

function createTopicRow(topic) {
  const row = document.createElement('div');
  const nameButton = document.createElement('button');
  const topicName = document.createElement('span');
  const enterButton = document.createElement('button');

  row.className = 'topic-row';
  row.dataset.topicId = String(topic.id);
  row.draggable = true;
  row.setAttribute('title', topic.name);
  row.classList.toggle('is-active', topic.id === selectedTopicId);

  nameButton.type = 'button';
  nameButton.className = 'topic-button';
  nameButton.setAttribute('aria-label', `Select ${topic.name}`);

  topicName.className = 'topic-name';
  topicName.textContent = topic.name;
  nameButton.appendChild(topicName);

  enterButton.type = 'button';
  enterButton.className = 'topic-enter-button';
  enterButton.setAttribute('aria-label', `Open ${topic.name}`);
  enterButton.textContent = '->';

  nameButton.addEventListener('click', () => setActiveTopic(topic.id));
  nameButton.addEventListener('dblclick', () => renameTopic(row));
  row.addEventListener('contextmenu', (event) => showContextMenu(event, row));
  row.addEventListener('dragstart', (event) => handleTopicDragStart(event, topic.id));
  row.addEventListener('dragover', (event) => handleTopicDragOver(event, topic.id));
  row.addEventListener('drop', (event) => handleTopicDrop(event));
  row.addEventListener('dragend', clearDragState);
  enterButton.addEventListener('click', (event) => {
    event.stopPropagation();
    enterTopic(topic.id);
  });

  row.append(nameButton, enterButton);
  return row;
}

function enterTopic(topicId) {
  const topic = findTopic(topicId);

  if (!topic) {
    return;
  }

  if (sidebar.classList.contains('is-collapsed')) {
    toggleSidebar();
  }

  selectedTopicId = topic.id;
  currentTopicId = topic.id;
  selectedPageId = findPageById(selectedPageId, topic)?.page ? selectedPageId : null;
  closeAddPagePopup();
  hideContextMenu();
  renderTopics();
  renderTopicDetail(topic.id);
  sidebarContent.dataset.view = 'detail';
}

function exitTopic() {
  currentTopicId = null;
  closeAddPagePopup();
  sidebarContent.dataset.view = 'topics';
  renderTopics();
}

function renderTopicDetail(topicId) {
  const topic = findTopic(topicId);

  if (!topic) {
    exitTopic();
    return;
  }

  topicDetailTitle.textContent = topic.name;
  topicDetailTitle.setAttribute('title', topic.name);
  renderPages(topicId);
}

function renderPages(topicId) {
  const topic = findTopic(topicId);

  pageList.replaceChildren();

  if (!topic) {
    return;
  }

  topic.pages.forEach((page, index) => {
    pageList.appendChild(renderPageRow(page, {
      parentTabId: null,
      index,
      isChild: false
    }));

    if (page.type === 'tab') {
      pageList.appendChild(renderTabChildren(page));
    }
  });

  refreshOpenDropdowns();
}

function renderTabChildren(tabPage) {
  const childrenContainer = document.createElement('div');

  childrenContainer.className = 'tab-children';
  childrenContainer.dataset.parentTabId = String(tabPage.id);
  childrenContainer.classList.toggle('is-collapsed', Boolean(tabPage.collapsed));
  childrenContainer.inert = Boolean(tabPage.collapsed);
  childrenContainer.setAttribute('aria-hidden', String(Boolean(tabPage.collapsed)));

  tabPage.children.forEach((child, childIndex) => {
    childrenContainer.appendChild(renderPageRow(child, {
      parentTabId: tabPage.id,
      index: childIndex,
      isChild: true
    }));
  });

  updateDropdownAnimation(childrenContainer, !tabPage.collapsed, false);
  return childrenContainer;
}

function renderPageRow(page, options) {
  const row = document.createElement('div');
  const pageButton = document.createElement('button');
  const pageName = document.createElement('span');
  const marker = document.createElement('span');

  row.className = 'page-row';
  row.dataset.pageId = String(page.id);
  row.dataset.parentTabId = options.parentTabId === null ? '' : String(options.parentTabId);
  row.dataset.index = String(options.index);
  row.dataset.pageType = page.type;
  row.draggable = true;
  row.classList.toggle('is-child', options.isChild);
  row.classList.toggle('is-tab', page.type === 'tab');
  row.classList.toggle('is-collapsed', page.type === 'tab' && Boolean(page.collapsed));
  row.classList.toggle('is-active', page.id === selectedPageId);
  row.setAttribute('title', page.name);

  pageButton.type = 'button';
  pageButton.className = 'page-button';
  pageButton.dataset.pageId = String(page.id);

  if (options.isChild) {
    const childDash = document.createElement('span');

    childDash.className = 'child-dash';
    childDash.textContent = '-';
    pageButton.appendChild(childDash);
  }

  pageName.className = 'page-name';
  pageName.textContent = page.name;
  pageButton.appendChild(pageName);

  marker.className = 'page-type-marker';
  marker.textContent = PAGE_TYPE_MARKERS[page.type];
  marker.setAttribute('aria-hidden', 'true');

  pageButton.addEventListener('click', (event) => {
    selectPage(page.id);

    if (page.type === 'tab' && !dragState && event.detail === 1) {
      toggleTabCollapsed(page.id);
    }
  });
  pageButton.addEventListener('dblclick', () => {
    startRenamingPage(page.id);
  });
  row.addEventListener('contextmenu', (event) => showPageContextMenu(event, page.id));
  row.addEventListener('click', (event) => {
    if (page.type !== 'tab' || dragState || event.target.closest('.tab-add-button, .page-button')) {
      return;
    }

    selectPage(page.id);
    toggleTabCollapsed(page.id);
  });
  row.addEventListener('dragstart', (event) => handlePageDragStart(event, page.id));
  row.addEventListener('dragover', (event) => handlePageDragOver(event, getPageDropInfo(event, row)));
  row.addEventListener('drop', (event) => handlePageDrop(event, dropTarget));
  row.addEventListener('dragend', clearDragState);

  row.append(pageButton, marker);

  if (page.type === 'tab') {
    const tabAddButton = document.createElement('button');

    tabAddButton.type = 'button';
    tabAddButton.className = 'tab-add-button';
    tabAddButton.textContent = '+';
    tabAddButton.setAttribute('aria-label', `Add page inside ${page.name}`);
    tabAddButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openAddPagePopup(tabAddButton, page.id);
    });
    tabAddButton.addEventListener('mousedown', (event) => event.stopPropagation());
    tabAddButton.addEventListener('dragstart', (event) => event.preventDefault());
    row.append(tabAddButton);
  }
  return row;
}

function openAddPagePopup(anchor, parentTabId = null) {
  if (currentTopicId === null) {
    return;
  }

  const sidebarRect = sidebar.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();

  addPageParentTabId = parentTabId;
  addPagePopup.querySelector('[data-page-type="tab"]').hidden = parentTabId !== null;
  addPagePopup.style.left = `${sidebarRect.right + 8}px`;
  addPagePopup.style.top = `${anchorRect.top}px`;
  addPagePopup.classList.add('is-visible');
  addPagePopup.setAttribute('aria-hidden', 'false');
}

function closeAddPagePopup() {
  addPagePopup.classList.remove('is-visible');
  addPagePopup.setAttribute('aria-hidden', 'true');
  addPageParentTabId = null;
}

function toggleTabCollapsed(tabId) {
  const tab = findPageById(tabId)?.page;
  const tabRow = getPageRow(tabId);
  const childrenContainer = pageList.querySelector(`.tab-children[data-parent-tab-id="${tabId}"]`);

  if (!tab || tab.type !== 'tab' || !childrenContainer) {
    return;
  }

  tab.collapsed = !tab.collapsed;
  tabRow?.classList.toggle('is-collapsed', tab.collapsed);
  childrenContainer.classList.toggle('is-collapsed', tab.collapsed);
  childrenContainer.inert = tab.collapsed;
  childrenContainer.setAttribute('aria-hidden', String(tab.collapsed));
  updateDropdownAnimation(childrenContainer, !tab.collapsed, true);
}

function updateDropdownAnimation(element, expanded, animate = false) {
  if (!animate) {
    element.classList.add('no-dropdown-transition');
  }

  element.style.setProperty('--dropdown-height', expanded ? `${element.scrollHeight}px` : '0px');

  if (!animate) {
    element.offsetHeight;
    element.classList.remove('no-dropdown-transition');
  }
}

function refreshOpenDropdowns() {
  updateDropdownAnimation(topicList, !topicsView.classList.contains('is-closed'), false);

  pageList.querySelectorAll('.tab-children').forEach((childrenContainer) => {
    updateDropdownAnimation(childrenContainer, !childrenContainer.classList.contains('is-collapsed'), false);
  });
}

function createPage(type, parentTabId = null) {
  const topic = findTopic(currentTopicId);
  const pageName = PAGE_TYPE_NAMES[type];

  if (!topic || !pageName || (parentTabId !== null && type === 'tab')) {
    return;
  }

  pageIdCounter += 1;
  const page = {
    id: pageIdCounter,
    type,
    name: pageName
  };

  if (type === 'tab') {
    page.children = [];
    page.collapsed = true;
  }

  insertPageAt(page, parentTabId, getPageArray(parentTabId, topic)?.length ?? topic.pages.length);
  selectedPageId = page.id;
  closeAddPagePopup();
  renderTopicDetail(topic.id);
  startRenamingPage(page.id);
}

function renameTopic(topicRow) {
  if (!topicRow) {
    return;
  }

  const topic = findTopic(getTopicIdFromRow(topicRow));
  const nameButton = topicRow.querySelector('.topic-button');
  const currentName = topicRow.querySelector('.topic-name');

  if (!topic || !nameButton || !currentName) {
    return;
  }

  const originalName = currentName.textContent;
  const editor = document.createElement('span');
  let isFinished = false;

  topicRow.draggable = false;
  topicRow.classList.add('is-editing');
  editor.className = 'topic-name-editor';
  editor.textContent = originalName;
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-label', 'Topic name');
  editor.setAttribute('spellcheck', 'false');

  nameButton.replaceChildren(editor);
  editor.focus();
  selectElementText(editor);

  editor.addEventListener('click', (event) => event.stopPropagation());
  editor.addEventListener('input', () => enforceTopicNameLimit(editor));

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finishRenameOnce(editor.textContent);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      finishRenameOnce(originalName);
    }
  });

  editor.addEventListener('blur', () => finishRenameOnce(editor.textContent), { once: true });

  function finishRenameOnce(value) {
    if (isFinished) {
      return;
    }

    isFinished = true;
    finishRename(topicRow, value);
  }
}

function finishRename(topicRow, rawName) {
  const topic = findTopic(getTopicIdFromRow(topicRow));
  const nameButton = topicRow.querySelector('.topic-button');
  const enterButton = topicRow.querySelector('.topic-enter-button');
  const topicName = document.createElement('span');
  const cleanName = sanitizeTopicName(rawName);

  if (!topic || !nameButton) {
    return;
  }

  topic.name = cleanName;
  topicName.className = 'topic-name';
  topicName.textContent = cleanName;
  topicRow.draggable = true;
  topicRow.classList.remove('is-editing');
  topicRow.setAttribute('title', cleanName);
  nameButton.setAttribute('aria-label', `Select ${cleanName}`);
  enterButton?.setAttribute('aria-label', `Open ${cleanName}`);
  nameButton.replaceChildren(topicName);
  nameButton.focus();

  if (topic.id === currentTopicId) {
    renderTopicDetail(topic.id);
  }
}

function startRenamingPage(pageId) {
  const pageRow = getPageRow(pageId);
  const pageButton = pageRow?.querySelector('.page-button');
  const page = findPageById(pageId)?.page;
  const currentName = pageRow?.querySelector('.page-name');

  if (!pageRow || !pageButton || !page || !currentName) {
    return;
  }

  const originalName = currentName.textContent;
  const editor = document.createElement('span');
  let isFinished = false;

  selectPage(pageId);
  pageRow.draggable = false;
  pageRow.classList.add('is-editing');
  editor.className = 'topic-name-editor';
  editor.textContent = originalName;
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-label', 'Page name');
  editor.setAttribute('spellcheck', 'false');

  pageButton.replaceChildren(editor);
  editor.focus();
  selectElementText(editor);

  editor.addEventListener('click', (event) => event.stopPropagation());
  editor.addEventListener('input', () => enforcePageNameLimit(editor));

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finishRenameOnce(editor.textContent, finishRenamingPage);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      finishRenameOnce(originalName, cancelRenamingPage);
    }
  });

  editor.addEventListener('blur', () => finishRenameOnce(editor.textContent), { once: true });

  function finishRenameOnce(value, renameHandler = finishRenamingPage) {
    if (isFinished) {
      return;
    }

    isFinished = true;
    renameHandler(pageId, value);
  }
}

function finishRenamingPage(pageId, rawName) {
  const page = findPageById(pageId)?.page;

  if (!page) {
    return;
  }

  page.name = sanitizePageName(rawName, page.type);
  renderTopicDetail(currentTopicId);
  getPageRow(pageId)?.querySelector('.page-button')?.focus();
}

function cancelRenamingPage(pageId, originalName) {
  const page = findPageById(pageId)?.page;

  if (!page) {
    return;
  }

  page.name = sanitizePageName(originalName, page.type);
  renderTopicDetail(currentTopicId);
  getPageRow(pageId)?.querySelector('.page-button')?.focus();
}

function sanitizeTopicName(name) {
  const trimmedName = name.trim().replace(/\s+/g, ' ');

  if (!trimmedName) {
    return DEFAULT_TOPIC_NAME;
  }

  return trimmedName.slice(0, MAX_TOPIC_NAME_LENGTH);
}

function sanitizePageName(name, type) {
  const trimmedName = name.trim().replace(/\s+/g, ' ');

  if (!trimmedName) {
    return PAGE_TYPE_NAMES[type];
  }

  return trimmedName.slice(0, MAX_PAGE_NAME_LENGTH);
}

function enforceTopicNameLimit(editor) {
  if (editor.textContent.length <= MAX_TOPIC_NAME_LENGTH) {
    return;
  }

  editor.textContent = editor.textContent.slice(0, MAX_TOPIC_NAME_LENGTH);
  placeCaretAtEnd(editor);
}

function enforcePageNameLimit(editor) {
  if (editor.textContent.length <= MAX_PAGE_NAME_LENGTH) {
    return;
  }

  editor.textContent = editor.textContent.slice(0, MAX_PAGE_NAME_LENGTH);
  placeCaretAtEnd(editor);
}

function selectElementText(element) {
  const range = document.createRange();
  const selection = window.getSelection();

  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtEnd(element) {
  const range = document.createRange();
  const selection = window.getSelection();

  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setActiveTopic(topicId) {
  selectedTopicId = topicId;
  topicList.querySelectorAll('.topic-row').forEach((row) => {
    row.classList.toggle('is-active', getTopicIdFromRow(row) === selectedTopicId);
  });
}

function selectPage(pageId) {
  selectedPageId = pageId;
  pageList.querySelectorAll('.page-row').forEach((row) => {
    row.classList.toggle('is-active', getPageIdFromRow(row) === selectedPageId);
  });
}

function openDeleteTopicModal(topicElement) {
  const topic = findTopic(getTopicIdFromRow(topicElement));

  if (!topic) {
    return;
  }

  deleteTarget = { type: 'topic', id: topic.id };
  deleteModalTitle.textContent = 'Delete Topic?';
  deleteModalMessage.textContent = `"${topic.name}" will be removed from your sidebar.`;
  openDeleteModal();
}

function openDeletePageModal(pageId) {
  const page = findPageById(pageId)?.page;

  if (!page) {
    return;
  }

  deleteTarget = { type: 'page', id: page.id, topicId: currentTopicId };
  deleteModalTitle.textContent = 'Delete Page?';
  deleteModalMessage.textContent = `"${page.name}" will be removed from this topic.`;
  openDeleteModal();
}

function openDeleteModal() {
  deleteTopicModal.classList.add('is-visible');
  deleteTopicModal.setAttribute('aria-hidden', 'false');
  confirmDeleteButton.focus();
}

function closeDeleteTopicModal() {
  deleteTopicModal.classList.remove('is-visible');
  deleteTopicModal.setAttribute('aria-hidden', 'true');
  deleteTarget = null;
}

function confirmDeleteTopic() {
  if (!deleteTarget) {
    return;
  }

  const target = { ...deleteTarget };

  closeDeleteTopicModal();

  if (target.type === 'topic') {
    deleteTopic(target.id);
  }

  if (target.type === 'page') {
    confirmDeletePage(target.id, target.topicId);
  }
}

function deleteTopic(topicElementOrId) {
  const topicId = typeof topicElementOrId === 'number'
    ? topicElementOrId
    : getTopicIdFromRow(topicElementOrId);
  const deletedIndex = topics.findIndex((topic) => topic.id === topicId);

  if (deletedIndex === -1) {
    return;
  }

  const wasSelected = selectedTopicId === topicId;
  const wasOpen = currentTopicId === topicId;

  topics.splice(deletedIndex, 1);

  if (wasSelected) {
    selectedTopicId = topics[deletedIndex]?.id || topics[deletedIndex - 1]?.id || null;
  }

  if (wasOpen) {
    currentTopicId = null;
    selectedPageId = null;
    sidebarContent.dataset.view = 'topics';
    closeAddPagePopup();
  }

  renderTopics();
}

function confirmDeletePage(pageId = deleteTarget?.id, topicId = deleteTarget?.topicId) {
  if (pageId === undefined) {
    return;
  }

  deletePage(pageId, topicId);
}

function deletePage(pageId, topicId = currentTopicId) {
  const topic = findTopic(topicId);
  const removed = removePageById(pageId, topic);

  if (!removed) {
    return;
  }

  if (selectedPageId === pageId || pageContainsPage(removed.page, selectedPageId)) {
    selectedPageId = getFirstPageId(topic);
  }

  if (topic?.id === currentTopicId) {
    renderTopicDetail(topic.id);
  }
}

function isDeleteModalOpen() {
  return deleteTopicModal.classList.contains('is-visible');
}

function showContextMenu(event, topicRow) {
  event.preventDefault();
  setActiveTopic(getTopicIdFromRow(topicRow));
  closeAddPagePopup();

  contextTarget = { type: 'topic', id: getTopicIdFromRow(topicRow) };
  showContextMenuAt(event.clientX, event.clientY);
}

function showPageContextMenu(event, pageId) {
  event.preventDefault();
  selectPage(pageId);
  closeAddPagePopup();

  contextTarget = { type: 'page', id: pageId };
  showContextMenuAt(event.clientX, event.clientY);
}

function handleContextRename() {
  if (contextTarget?.type === 'topic') {
    const row = getTopicRow(contextTarget.id);

    if (row) {
      renameTopic(row);
    }
  }

  if (contextTarget?.type === 'page') {
    startRenamingPage(contextTarget.id);
  }

  hideContextMenu();
}

function handleContextDelete() {
  if (contextTarget?.type === 'topic') {
    const row = getTopicRow(contextTarget.id);

    if (row) {
      openDeleteTopicModal(row);
    }
  }

  if (contextTarget?.type === 'page') {
    openDeletePageModal(contextTarget.id);
  }

  hideContextMenu();
}

function showContextMenuAt(left, top) {
  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
  contextMenu.classList.add('is-visible');
  contextMenu.setAttribute('aria-hidden', 'false');
}

function hideContextMenu() {
  contextMenu.classList.remove('is-visible');
  contextMenu.setAttribute('aria-hidden', 'true');
  contextTarget = null;
}

function handleTopicDragStart(event, topicId) {
  dragState = { type: 'topic', id: topicId };
  activeDropKey = null;
  activeDropDistance = Infinity;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(topicId));
  event.currentTarget.classList.add('is-dragging');
  closeAddPagePopup();
  hideContextMenu();
}

function handleTopicDragOver(event, topicId) {
  if (dragState?.type !== 'topic') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const target = getNearestDropTarget(event.clientY, getTopicDropTargets());

  if (!target || !shouldUpdateDropTarget(dropTarget, target, DROP_TARGET_SWITCH_THRESHOLD)) {
    return;
  }

  dropTarget = target;
  placeTopicDropIndicator(target);
}

function handleTopicDrop(event, targetIndex = dropTarget?.index) {
  if (dragState?.type !== 'topic') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const currentIndex = topics.findIndex((topic) => topic.id === dragState.id);

  if (currentIndex !== -1 && targetIndex !== undefined) {
    const [topic] = topics.splice(currentIndex, 1);
    const adjustedIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;

    topics.splice(clampIndex(adjustedIndex, topics.length), 0, topic);
    renderTopics();
  }

  clearDragState();
}

function handlePageDragStart(event, pageId) {
  const page = findPageById(pageId)?.page;

  if (!page) {
    return;
  }

  dragState = { type: 'page', id: pageId, pageType: page.type };
  activeDropKey = null;
  activeDropDistance = Infinity;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(pageId));
  event.currentTarget.classList.add('is-dragging');
  closeAddPagePopup();
  hideContextMenu();
}

function handlePageDragOver(event, targetInfo) {
  if (dragState?.type !== 'page') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const normalizedTarget = normalizePageDropTarget(getNearestDropTarget(
    event.clientY,
    getPageDropTargets(event, targetInfo)
  ));

  if (!normalizedTarget) {
    dropTarget = null;
    activeDropKey = null;
    activeDropDistance = Infinity;
    clearTabDropHighlights();
    removeDropIndicators();
    return;
  }

  if (!shouldUpdateDropTarget(dropTarget, normalizedTarget, DROP_TARGET_SWITCH_THRESHOLD)) {
    return;
  }

  clearTabDropHighlights();
  dropTarget = normalizedTarget;

  if (normalizedTarget.mode === 'into') {
    getPageRow(normalizedTarget.parentTabId)?.classList.add('is-tab-drop-target');
    removeDropIndicators();
    return;
  }

  placePageDropIndicator(normalizedTarget);
}

function handlePageDrop(event, targetInfo) {
  if (dragState?.type !== 'page') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (targetInfo) {
    movePage(dragState.id, targetInfo.parentTabId, targetInfo.index);
  }

  clearDragState();
}

function getPageDropInfo(event, row) {
  return {
    cursorX: event.clientX,
    row
  };
}

function normalizePageDropTarget(targetInfo) {
  if (!targetInfo) {
    return null;
  }

  if (dragState.pageType === 'tab' && targetInfo.parentTabId !== null) {
    return null;
  }

  if (targetInfo.mode === 'into') {
    if (dragState.pageType === 'tab') {
      return null;
    }

    return targetInfo;
  }

  return targetInfo;
}

function getNearestDropTarget(cursorY, validTargets) {
  if (!validTargets.length) {
    return null;
  }

  return validTargets.reduce((nearest, target) => {
    const distance = Math.abs(cursorY - target.y);

    if (!nearest || distance < nearest.distance) {
      return {
        ...target,
        distance
      };
    }

    return nearest;
  }, null);
}

function shouldUpdateDropTarget(previousTarget, nextTarget, threshold) {
  const nextKey = getDropTargetKey(nextTarget);

  if (!previousTarget || activeDropKey === null) {
    activeDropKey = nextKey;
    activeDropDistance = nextTarget.distance ?? 0;
    return true;
  }

  if (activeDropKey === nextKey) {
    activeDropDistance = nextTarget.distance ?? 0;
    return false;
  }

  if ((nextTarget.distance ?? 0) > activeDropDistance - threshold) {
    return false;
  }

  activeDropKey = nextKey;
  activeDropDistance = nextTarget.distance ?? 0;
  return true;
}

function getDropTargetKey(target) {
  if (!target) {
    return '';
  }

  return [
    target.type || 'page',
    target.mode || 'insert',
    target.parentTabId ?? 'top',
    target.index,
    target.anchorId ?? 'end',
    target.isAfter ? 'after' : 'before'
  ].join(':');
}

function getTopicDropTargets() {
  const targets = topics.map((topic, index) => {
    const row = getTopicRow(topic.id);
    const rect = row.getBoundingClientRect();

    return {
      type: 'topic',
      index,
      y: rect.top,
      row,
      isAfter: false,
      anchorId: topic.id
    };
  });

  const lastTopic = topics[topics.length - 1];

  if (lastTopic) {
    const lastRow = getTopicRow(lastTopic.id);
    const lastRect = lastRow.getBoundingClientRect();

    targets.push({
      type: 'topic',
      index: topics.length,
      y: lastRect.bottom,
      row: lastRow,
      isAfter: true,
      anchorId: lastTopic.id
    });
  } else {
    const listRect = topicList.getBoundingClientRect();

    targets.push({
      type: 'topic',
      index: 0,
      y: listRect.top,
      row: null,
      isAfter: true,
      anchorId: 'empty'
    });
  }

  return targets;
}

function getPageDropTargets(event, targetInfo) {
  const topic = findTopic(currentTopicId);
  const targets = [];

  if (!topic) {
    return targets;
  }

  topic.pages.forEach((page, index) => {
    const row = getPageRow(page.id);

    if (!row || page.id === dragState?.id) {
      return;
    }

    const rect = row.getBoundingClientRect();

    targets.push({
      mode: 'insert',
      parentTabId: null,
      index,
      y: rect.top,
      row,
      isAfter: false,
      anchorId: page.id
    });

    if (page.type === 'tab' && dragState?.pageType !== 'tab' && dragState?.id !== page.id && event.clientX > rect.left + 56) {
      targets.push({
        mode: 'into',
        parentTabId: page.id,
        index: page.children.length,
        y: rect.top + rect.height / 2,
        anchorId: page.id
      });
    }

    if (page.type === 'tab' && !page.collapsed) {
      page.children.forEach((child, childIndex) => {
        const childRow = getPageRow(child.id);

        if (!childRow || child.id === dragState?.id) {
          return;
        }

        const childRect = childRow.getBoundingClientRect();

        targets.push({
          mode: 'insert',
          parentTabId: page.id,
          index: childIndex,
          y: childRect.top,
          row: childRow,
          isAfter: false,
          anchorId: child.id
        });
      });

      const lastChild = page.children[page.children.length - 1];

      if (lastChild) {
        const lastChildRow = getPageRow(lastChild.id);
        const lastChildRect = lastChildRow.getBoundingClientRect();

        targets.push({
          mode: 'insert',
          parentTabId: page.id,
          index: page.children.length,
          y: lastChildRect.bottom,
          row: lastChildRow,
          isAfter: true,
          anchorId: lastChild.id
        });
      }
    }
  });

  const lastPage = topic.pages[topic.pages.length - 1];

  if (lastPage) {
    const lastElement = getLastVisiblePageElement(lastPage);
    const lastRect = lastElement.getBoundingClientRect();

    targets.push({
      mode: 'insert',
      parentTabId: null,
      index: topic.pages.length,
      y: lastRect.bottom,
      element: lastElement,
      isAfter: true,
      anchorId: lastPage.id
    });
  } else {
    const listRect = pageList.getBoundingClientRect();

    targets.push({
      mode: 'insert',
      parentTabId: null,
      index: 0,
      y: listRect.top,
      row: null,
      isAfter: true,
      anchorId: 'empty'
    });
  }

  return targets;
}

function placePageDropIndicator(targetInfo) {
  if (targetInfo.element) {
    targetInfo.element[targetInfo.isAfter ? 'after' : 'before'](pageDropIndicator);
    return;
  }

  if (targetInfo.row) {
    targetInfo.row[targetInfo.isAfter ? 'after' : 'before'](pageDropIndicator);
    return;
  }

  pageList.appendChild(pageDropIndicator);
}

function placeTopicDropIndicator(targetInfo) {
  if (targetInfo.row) {
    targetInfo.row[targetInfo.isAfter ? 'after' : 'before'](topicDropIndicator);
    return;
  }

  topicList.appendChild(topicDropIndicator);
}

function clearDragState() {
  dragState = null;
  dropTarget = null;
  activeDropKey = null;
  activeDropDistance = Infinity;
  document.querySelectorAll('.is-dragging').forEach((element) => element.classList.remove('is-dragging'));
  clearTabDropHighlights();
  removeDropIndicators();
}

function clearTabDropHighlights() {
  pageList.querySelectorAll('.is-tab-drop-target').forEach((row) => {
    row.classList.remove('is-tab-drop-target');
  });
}

function removeDropIndicators() {
  topicDropIndicator.remove();
  pageDropIndicator.remove();
}

function findPageById(pageId, topic = findTopic(currentTopicId)) {
  if (!topic || pageId === null) {
    return null;
  }

  for (let index = 0; index < topic.pages.length; index += 1) {
    const page = topic.pages[index];

    if (page.id === pageId) {
      return {
        page,
        parentTabId: null,
        index,
        array: topic.pages
      };
    }

    if (page.type === 'tab') {
      const childIndex = page.children.findIndex((child) => child.id === pageId);

      if (childIndex !== -1) {
        return {
          page: page.children[childIndex],
          parentTabId: page.id,
          index: childIndex,
          array: page.children
        };
      }
    }
  }

  return null;
}

function removePageById(pageId, topic = findTopic(currentTopicId)) {
  const pageInfo = findPageById(pageId, topic);

  if (!pageInfo) {
    return null;
  }

  const [page] = pageInfo.array.splice(pageInfo.index, 1);

  return {
    ...pageInfo,
    page
  };
}

function insertPageAt(page, targetParentId, targetIndex) {
  const targetArray = getPageArray(targetParentId);

  if (!targetArray || (page.type === 'tab' && targetParentId !== null)) {
    return false;
  }

  targetArray.splice(clampIndex(targetIndex, targetArray.length), 0, page);
  return true;
}

function movePage(pageId, targetParentId, targetIndex) {
  const topic = findTopic(currentTopicId);
  const sourceInfo = findPageById(pageId, topic);

  if (!topic || !sourceInfo) {
    return;
  }

  if (sourceInfo.page.type === 'tab' && targetParentId !== null) {
    return;
  }

  if (sourceInfo.page.id === targetParentId) {
    return;
  }

  const removed = removePageById(pageId, topic);

  if (!removed) {
    return;
  }

  let adjustedIndex = targetIndex;

  if (removed.parentTabId === targetParentId && removed.index < targetIndex) {
    adjustedIndex -= 1;
  }

  insertPageAt(removed.page, targetParentId, adjustedIndex);
  renderTopicDetail(topic.id);
}

function getPageArray(parentTabId, topic = findTopic(currentTopicId)) {
  if (!topic) {
    return null;
  }

  if (parentTabId === null) {
    return topic.pages;
  }

  const parentTab = findPageById(parentTabId, topic)?.page;

  return parentTab?.type === 'tab' ? parentTab.children : null;
}

function getLastVisiblePageElement(page) {
  if (page.type === 'tab' && !page.collapsed && page.children.length) {
    return getPageRow(page.children[page.children.length - 1].id);
  }

  return getPageRow(page.id);
}

function getFirstPageId(topic) {
  if (!topic) {
    return null;
  }

  for (const page of topic.pages) {
    if (page.id) {
      return page.id;
    }

    if (page.type === 'tab' && page.children[0]) {
      return page.children[0].id;
    }
  }

  return null;
}

function pageContainsPage(page, pageId) {
  if (!page || pageId === null) {
    return false;
  }

  return page.type === 'tab' && page.children.some((child) => child.id === pageId);
}

function getTopicRow(topicId) {
  if (topicId === null) {
    return null;
  }

  return topicList.querySelector(`[data-topic-id="${topicId}"]`);
}

function getTopicIdFromRow(topicRow) {
  return Number(topicRow?.dataset.topicId);
}

function findTopic(topicId) {
  return topics.find((topic) => topic.id === topicId);
}

function getPageRow(pageId) {
  if (pageId === null) {
    return null;
  }

  return pageList.querySelector(`[data-page-id="${pageId}"]`);
}

function getPageIdFromRow(pageRow) {
  return Number(pageRow?.dataset.pageId);
}

function getParentTabIdFromRow(pageRow) {
  return pageRow?.dataset.parentTabId ? Number(pageRow.dataset.parentTabId) : null;
}

function clampIndex(index, length) {
  return Math.max(0, Math.min(index, length));
}
