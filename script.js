document.addEventListener('DOMContentLoaded', () => {
    // --- Constants and State ---
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbz2dgdZkvk6RHyFz_wL0iVx5ciBwVAlA1W_-WNvtYjWqmvSrFls7N1lB6aL-vULB4R9mg/exec'; // <-- REPLACE THIS WITH YOUR DEPLOYED URL
    let allEquipment = []; // Cache for equipment data
    let allTechnicians = []; // Cache for technician data

    // --- DOM Element References ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const sections = document.querySelectorAll('.app-section');
    const navLinks = document.querySelectorAll('.nav-link'); // Both desktop and mobile
    const equipmentTableBody = document.getElementById('equipment-table-body');
    const techniciansTableBody = document.getElementById('technicians-table-body');
    const equipmentSearchInput = document.getElementById('equipment-search');
    const departmentFilter = document.getElementById('equipment-filter-department');
    const statusFilter = document.getElementById('equipment-filter-status');
    const addEquipmentForm = document.getElementById('form-add-equipment');
    const addTechnicianForm = document.getElementById('form-add-technician');
    const logServiceForm = document.getElementById('form-log-service');
    const logServiceEquipName = document.getElementById('log-service-equip-name');
    const logServiceEquipId = document.getElementById('log-service-equip-id');
    const logServiceTechnicianSelect = document.getElementById('log-service-technician');
    const logServiceLikelihood = document.getElementById('log-service-likelihood');
    const logServiceSeverity = document.getElementById('log-service-severity');
    const logServiceDetectability = document.getElementById('log-service-detectability');
    const logServiceRpnSpan = document.getElementById('log-service-rpn');
    const logServiceRiskLevelSpan = document.getElementById('log-service-risk-level');
    const logServiceActionSpan = document.getElementById('log-service-action');
    const viewEquipmentContent = document.getElementById('view-equipment-content');
    const viewEquipmentLogs = document.getElementById('view-equipment-logs');
    const overdueCountEl = document.getElementById('overdue-count');
    const attentionCountEl = document.getElementById('attention-count');
    const upcomingCountEl = document.getElementById('upcoming-count'); // Assuming logic for this exists or will be added
    const activeEquipCountEl = document.getElementById('active-equip-count');
    const priorityTasksList = document.getElementById('priority-tasks-list');


    // --- Materialize Initialization ---
    M.Sidenav.init(document.querySelectorAll('.sidenav'));
    M.Modal.init(document.querySelectorAll('.modal'));
    M.Datepicker.init(document.querySelectorAll('.datepicker'), { format: 'yyyy-mm-dd', autoClose: true });
    M.FormSelect.init(document.querySelectorAll('select')); // Initialize all selects initially

    // --- Helper Functions ---

    /**
     * Shows the loading indicator.
     */
    function showLoading() {
        if (loadingIndicator) loadingIndicator.style.display = 'block';
    }

    /**
     * Hides the loading indicator.
     */
    function hideLoading() {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }

    /**
     * Generic function to fetch data from the Google Apps Script.
     * @param {string} action - The action parameter for the GET request.
     * @param {object} [params={}] - Optional additional URL parameters.
     * @returns {Promise<any>} - The data array from the response.
     */
    async function fetchData(action, params = {}) {
        showLoading();
        const url = new URL(GAS_URL);
        url.searchParams.append('action', action);
        for (const key in params) {
            if (params[key]) { // Only add if value is not empty/null
                 url.searchParams.append(key, params[key]);
            }
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            if (result.status === 'error') {
                throw new Error(`GAS Error: ${result.message}`);
            }
            // console.log(`Fetched ${action}:`, result.data); // Debug log
            return result.data;
        } catch (error) {
            console.error(`Error fetching ${action}:`, error);
            M.toast({ html: `Error fetching ${action}: ${error.message}`, classes: 'red darken-1' });
            return []; // Return empty array on error
        } finally {
            hideLoading();
        }
    }

     /**
     * Generic function to post data to the Google Apps Script.
     * @param {string} action - The action identifier.
     * @param {object} data - The data payload to send.
     * @returns {Promise<any>} - The JSON response from the script.
     */
    async function postData(action, data) {
        showLoading();
        try {
            const response = await fetch(GAS_URL, {
                method: 'POST',
                mode: 'cors', // Required for cross-origin requests to GAS web apps
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: action, data: data }),
                redirect: 'follow', // GAS doPost often involves redirects
            });

             // Handle potential opaque redirect (common with GAS doPost)
             if (response.type === 'opaque' || response.redirected) {
                 // Cannot read response body directly after redirect
                 // Assume success if no network error, but might need refinement
                 console.warn(`POST request for ${action} resulted in an opaque redirect. Assuming success.`);
                 hideLoading();
                 // Return a generic success structure, as we can't read the actual one
                 return { status: 'success', message: `${action} submitted. Response details unavailable due to redirect.` };
             }


            if (!response.ok) {
                 // Try to get error details if possible
                 let errorBody = 'Could not retrieve error details.';
                 try {
                     errorBody = await response.text(); // Use text() first
                 } catch (e) { /* ignore */ }
                throw new Error(`HTTP error! status: ${response.status}, Body: ${errorBody}`);
            }

            const result = await response.json();
            // console.log(`Posted ${action}:`, result); // Debug log
            return result;
        } catch (error) {
            console.error(`Error posting ${action}:`, error);
            M.toast({ html: `Error posting ${action}: ${error.message}`, classes: 'red darken-1' });
            throw error; // Re-throw to be caught by caller if needed
        } finally {
            hideLoading();
        }
    }

    /**
     * Calculates RPN based on L, S, D values. Matches Apps Script logic.
     * @param {number|string} likelihood
     * @param {number|string} severity
     * @param {number|string} detectability
     * @returns {number} Calculated RPN or 0 if invalid.
     */
    function calculateRPN(likelihood, severity, detectability) {
        const l = parseInt(likelihood, 10);
        const s = parseInt(severity, 10);
        const d = parseInt(detectability, 10);

        if (isNaN(l) || isNaN(s) || isNaN(d) || l < 0 || l > 5 || s < 1 || s > 5 || d < 1 || d > 4) {
            return 0;
        }
        return l * s * d;
    }

    /**
     * Determines Risk Level and Action based on RPN. Matches Apps Script logic.
     * @param {number} rpn
     * @returns {object} { riskLevel: string, actionRequired: string }
     */
    function determineRiskLevelAction(rpn) {
        if (rpn >= 1 && rpn <= 10) {
            return { riskLevel: "Negligible", actionRequired: "Monitor" };
        } else if (rpn >= 11 && rpn <= 30) {
            return { riskLevel: "Low", actionRequired: "Review Periodically" };
        } else if (rpn >= 31 && rpn <= 60) {
            return { riskLevel: "Medium", actionRequired: "Implement Corrective Action" };
        } else if (rpn >= 61 && rpn <= 100) {
            return { riskLevel: "High", actionRequired: "Immediate Action Required" };
        } else {
            return { riskLevel: "Undefined", actionRequired: "Assess Inputs" };
        }
    }

    /**
     * Updates the RPN display in the Log Service modal.
     */
    function updateRpnDisplay() {
        const l = logServiceLikelihood.value;
        const s = logServiceSeverity.value;
        const d = logServiceDetectability.value;

        if (l && s && d) {
            const rpn = calculateRPN(l, s, d);
            const riskInfo = determineRiskLevelAction(rpn);
            logServiceRpnSpan.textContent = rpn;
            logServiceRiskLevelSpan.textContent = riskInfo.riskLevel;
            logServiceActionSpan.textContent = riskInfo.actionRequired;
        } else {
            logServiceRpnSpan.textContent = 'N/A';
            logServiceRiskLevelSpan.textContent = 'N/A';
            logServiceActionSpan.textContent = 'N/A';
        }
    }

    // --- Data Rendering Functions ---

    /**
     * Renders the equipment data into the table.
     * @param {Array<object>} equipmentList - The equipment data to render.
     */
    function renderEquipmentTable(equipmentList) {
        if (!equipmentTableBody) return;
        equipmentTableBody.innerHTML = ''; // Clear existing rows

        if (!equipmentList || equipmentList.length === 0) {
            equipmentTableBody.innerHTML = '<tr><td colspan="7" class="center-align">No equipment found.</td></tr>';
            return;
        }

        equipmentList.forEach(equip => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${equip.Name || ''}</td>
                <td>${equip.Model || ''}</td>
                <td>${equip.SerialNumber || ''}</td>
                <td>${equip.Department || ''}</td>
                <td><span class="status-${(equip.Status || '').toLowerCase().replace(/\s+/g, '-')}">${equip.Status || ''}</span></td>
                <td>${equip.NextServiceDate ? new Date(equip.NextServiceDate).toLocaleDateString() : 'N/A'}</td>
                <td>
                    <i class="material-symbols-outlined action-btn tooltipped" data-position="top" data-tooltip="View Details" data-equip-id="${equip.EquipmentID}" data-action="view">visibility</i>
                    <i class="material-symbols-outlined action-btn tooltipped modal-trigger" data-position="top" data-tooltip="Log Service" href="#modal-log-service" data-equip-id="${equip.EquipmentID}" data-equip-name="${equip.Name || 'Equipment'}" data-action="log">history_edu</i>
                    <!-- Add Edit/Delete buttons here if needed -->
                </td>
            `;
            equipmentTableBody.appendChild(row);
        });
         // Reinitialize tooltips after rendering
        M.Tooltip.init(document.querySelectorAll('.tooltipped'));
    }

     /**
     * Renders the technician data into the table.
     * @param {Array<object>} techniciansList - The technician data to render.
     */
    function renderTechniciansTable(techniciansList) {
        if (!techniciansTableBody) return;
        techniciansTableBody.innerHTML = ''; // Clear existing rows

        if (!techniciansList || techniciansList.length === 0) {
            techniciansTableBody.innerHTML = '<tr><td colspan="5" class="center-align">No technicians found.</td></tr>';
            return;
        }

        techniciansList.forEach(tech => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${tech.Name || ''}</td>
                <td>${tech.Email || ''}</td>
                <td>${tech.Phone || ''}</td>
                <td>${tech.Qualifications || ''}</td>
                 <td><span class="status-${(tech.Status || '').toLowerCase()}">${tech.Status || ''}</span></td>
                <!-- Add actions column if needed -->
            `;
            techniciansTableBody.appendChild(row);
        });
    }

    /**
     * Populates filter dropdowns based on unique values in the equipment data.
     */
    function populateFilterDropdowns() {
        if (!departmentFilter || !statusFilter) return;

        const departments = [...new Set(allEquipment.map(e => e.Department).filter(Boolean))].sort();
        const statuses = [...new Set(allEquipment.map(e => e.Status).filter(Boolean))].sort();

        // Populate Department Filter
        departmentFilter.innerHTML = '<option value="" selected>All Departments</option>'; // Reset
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            departmentFilter.appendChild(option);
        });

        // Populate Status Filter
        statusFilter.innerHTML = '<option value="" selected>All Statuses</option>'; // Reset
        statuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            statusFilter.appendChild(option);
        });

        // Re-initialize Materialize selects after updating options
        M.FormSelect.init(document.querySelectorAll('select'));
    }

     /**
     * Populates the technician dropdown in the Log Service modal.
     */
    function populateTechnicianDropdown() {
        if (!logServiceTechnicianSelect) return;

        logServiceTechnicianSelect.innerHTML = '<option value="" disabled selected>Choose technician</option>'; // Reset
        const activeTechnicians = allTechnicians.filter(t => t.Status === 'Active').sort((a, b) => a.Name.localeCompare(b.Name));

        activeTechnicians.forEach(tech => {
            const option = document.createElement('option');
            option.value = tech.Name; // Or tech.TechnicianID if preferred
            option.textContent = tech.Name;
            logServiceTechnicianSelect.appendChild(option);
        });

        // Re-initialize the specific select
        M.FormSelect.init(logServiceTechnicianSelect);
    }

    /**
     * Updates the dashboard summary cards and priority tasks.
     */
    function renderDashboard() {
        if (!overdueCountEl || !attentionCountEl || !activeEquipCountEl || !priorityTasksList) return;

        let overdue = 0;
        let attention = 0;
        let active = 0;
        let upcoming = 0; // Placeholder for upcoming logic
        const highPriorityTasks = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today's date

        allEquipment.forEach(equip => {
            if (equip.Status === 'Active') active++;
            if (equip.Status === 'Overdue') overdue++;
            if (equip.Status === 'Needs Attention') attention++;

            // Basic upcoming/overdue logic based on NextServiceDate
            if (equip.NextServiceDate) {
                try {
                    const nextService = new Date(equip.NextServiceDate);
                     nextService.setHours(0, 0, 0, 0); // Normalize
                    const timeDiff = nextService.getTime() - today.getTime();
                    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                    if (dayDiff < 0 && equip.Status !== 'Inactive' && equip.Status !== 'Under Repair') {
                        // Already overdue based on date, ensure status reflects if not already set
                        if (equip.Status !== 'Overdue') {
                           // Maybe add to a list to suggest status update? For now, just count.
                           // If not already counted as Overdue by status, count it here.
                           if (equip.Status !== 'Overdue') overdue++;
                        }
                         highPriorityTasks.push({ ...equip, priority: 'Overdue', days: dayDiff });
                    } else if (dayDiff >= 0 && dayDiff <= 7 && equip.Status === 'Active') { // Upcoming within 7 days
                        upcoming++;
                        highPriorityTasks.push({ ...equip, priority: 'Upcoming', days: dayDiff });
                    } else if (equip.Status === 'Needs Attention') {
                         highPriorityTasks.push({ ...equip, priority: 'Needs Attention', days: null });
                    }

                } catch (e) {
                    console.warn(`Invalid NextServiceDate for ${equip.EquipmentID}: ${equip.NextServiceDate}`);
                }
            } else if (equip.Status === 'Needs Attention') {
                 highPriorityTasks.push({ ...equip, priority: 'Needs Attention', days: null });
            }
        });

        overdueCountEl.textContent = overdue;
        attentionCountEl.textContent = attention;
        activeEquipCountEl.textContent = active;
        upcomingCountEl.textContent = upcoming; // Update upcoming count

        // Render Priority Tasks
        priorityTasksList.innerHTML = ''; // Clear
        if (highPriorityTasks.length === 0) {
            priorityTasksList.innerHTML = '<li class="collection-item">No high priority tasks found.</li>';
        } else {
             // Sort tasks: Overdue first, then Needs Attention, then Upcoming by date
            highPriorityTasks.sort((a, b) => {
                const priorityOrder = { 'Overdue': 1, 'Needs Attention': 2, 'Upcoming': 3 };
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                }
                // If same priority (e.g., Upcoming), sort by days remaining
                if (a.days !== null && b.days !== null) {
                    return a.days - b.days;
                }
                return a.Name.localeCompare(b.Name); // Fallback sort by name
            });


            highPriorityTasks.forEach(task => {
                const li = document.createElement('li');
                li.className = 'collection-item';
                let priorityText = '';
                 if (task.priority === 'Overdue') {
                    priorityText = `<span class="new badge red" data-badge-caption="Overdue (${Math.abs(task.days)} days)"></span>`;
                } else if (task.priority === 'Upcoming') {
                    priorityText = `<span class="new badge orange" data-badge-caption="Due in ${task.days} days"></span>`;
                } else if (task.priority === 'Needs Attention') {
                     priorityText = `<span class="new badge yellow darken-2" data-badge-caption="Needs Attention"></span>`;
                }

                li.innerHTML = `
                    <div class="task-details">
                        <strong>${task.Name}</strong> (ID: ${task.EquipmentID}) - ${task.Department || 'N/A'}
                        ${priorityText}
                    </div>
                    <div class="task-actions">
                        <button class="btn-small waves-effect waves-light blue darken-2 modal-trigger action-btn" href="#modal-log-service" data-equip-id="${task.EquipmentID}" data-equip-name="${task.Name || 'Equipment'}" data-action="log">
                            <i class="material-symbols-outlined tiny">history_edu</i> Log
                        </button>
                         <button class="btn-small waves-effect waves-light grey darken-1 action-btn" data-equip-id="${task.EquipmentID}" data-action="view">
                            <i class="material-symbols-outlined tiny">visibility</i> View
                        </button>
                    </div>
                `;
                priorityTasksList.appendChild(li);
            });
        }
    }


    // --- Event Handlers ---

    /**
     * Handles navigation between sections.
     */
    function handleNavigation(event) {
        event.preventDefault();
        const targetId = event.target.getAttribute('href'); // e.g., #equipment-section

        if (!targetId || !targetId.startsWith('#')) return;

        // Remove active class from all links
        navLinks.forEach(link => link.classList.remove('active'));

        // Add active class to the clicked link (and its counterpart in the other nav)
        document.querySelectorAll(`.nav-link[href="${targetId}"]`).forEach(link => link.classList.add('active'));


        // Hide all sections
        sections.forEach(section => section.classList.add('hide'));

        // Show the target section
        const targetSection = document.querySelector(targetId);
        if (targetSection) {
            targetSection.classList.remove('hide');
            // Load data if needed when switching to a section
            if (targetId === '#equipment-section' && allEquipment.length === 0) {
                loadInitialData(); // Reload if empty
            } else if (targetId === '#technicians-section' && allTechnicians.length === 0) {
                 loadInitialData(); // Reload if empty
            } else if (targetId === '#dashboard-section') {
                 renderDashboard(); // Re-render dashboard on navigate
            }
        }

        // Close sidenav if open
        const sidenavInstance = M.Sidenav.getInstance(document.getElementById('mobile-nav'));
        if (sidenavInstance.isOpen) {
            sidenavInstance.close();
        }
    }

    /**
     * Filters the equipment table based on search and dropdown values.
     */
    function filterEquipmentTable() {
        const searchTerm = equipmentSearchInput.value.toLowerCase();
        const selectedDepartment = departmentFilter.value;
        const selectedStatus = statusFilter.value;

        const filteredEquipment = allEquipment.filter(equip => {
            const matchesSearch = !searchTerm ||
                (equip.Name && equip.Name.toLowerCase().includes(searchTerm)) ||
                (equip.Model && equip.Model.toLowerCase().includes(searchTerm)) ||
                (equip.SerialNumber && equip.SerialNumber.toLowerCase().includes(searchTerm)) ||
                (equip.EquipmentID && equip.EquipmentID.toLowerCase().includes(searchTerm)); // Include ID in search

            const matchesDepartment = !selectedDepartment || equip.Department === selectedDepartment;
            const matchesStatus = !selectedStatus || equip.Status === selectedStatus;

            return matchesSearch && matchesDepartment && matchesStatus;
        });

        renderEquipmentTable(filteredEquipment);
    }

    /**
     * Handles the submission of the Add Equipment form.
     */
    async function handleAddEquipment(event) {
        event.preventDefault();
        const formData = {
            Name: document.getElementById('add-equip-name').value,
            Model: document.getElementById('add-equip-model').value,
            SerialNumber: document.getElementById('add-equip-serial').value,
            InventoryCode: document.getElementById('add-equip-inventory').value,
            Department: document.getElementById('add-equip-department').value,
            Location: document.getElementById('add-equip-location').value,
            Manufacturer: document.getElementById('add-equip-manufacturer').value,
            Status: document.getElementById('add-equip-status').value,
            PurchaseDate: document.getElementById('add-equip-purchase-date').value,
            InstallationDate: document.getElementById('add-equip-install-date').value,
            LastServiceDate: document.getElementById('add-equip-last-service').value,
            NextServiceDate: document.getElementById('add-equip-next-service').value,
        };

        try {
            const result = await postData('addEquipment', formData);
            if (result.status === 'success') {
                M.toast({ html: 'Equipment added successfully!', classes: 'green darken-1' });
                addEquipmentForm.reset();
                M.updateTextFields(); // Update labels for cleared fields
                M.FormSelect.init(document.querySelectorAll('select')); // Re-init selects in form
                const modalInstance = M.Modal.getInstance(document.getElementById('modal-add-equipment'));
                modalInstance.close();
                loadInitialData(); // Refresh equipment list
            } else {
                throw new Error(result.message || 'Failed to add equipment.');
            }
        } catch (error) {
            // Error toast is handled by postData
        }
    }

    /**
     * Handles the submission of the Add Technician form.
     */
    async function handleAddTechnician(event) {
        event.preventDefault();
        const formData = {
            Name: document.getElementById('add-tech-name').value,
            Email: document.getElementById('add-tech-email').value,
            Phone: document.getElementById('add-tech-phone').value,
            Status: document.getElementById('add-tech-status').value,
            Qualifications: document.getElementById('add-tech-qualifications').value,
        };

         try {
            const result = await postData('addTechnician', formData);
            if (result.status === 'success') {
                M.toast({ html: 'Technician added successfully!', classes: 'green darken-1' });
                addTechnicianForm.reset();
                 M.updateTextFields();
                 M.FormSelect.init(document.querySelectorAll('select'));
                const modalInstance = M.Modal.getInstance(document.getElementById('modal-add-technician'));
                modalInstance.close();
                loadInitialData(); // Refresh technician list
            } else {
                 throw new Error(result.message || 'Failed to add technician.');
            }
        } catch (error) {
             // Error toast handled by postData
        }
    }

     /**
     * Handles the submission of the Log Service form.
     */
    async function handleLogService(event) {
        event.preventDefault();
        const formData = {
            EquipmentID: logServiceEquipId.value,
            ServiceType: document.getElementById('log-service-type').value,
            ServiceDate: document.getElementById('log-service-date').value,
            Technician: logServiceTechnicianSelect.value,
            WorkPerformed: document.getElementById('log-service-work').value,
            PartsUsed: document.getElementById('log-service-parts').value,
            Notes: document.getElementById('log-service-notes').value,
            Likelihood: logServiceLikelihood.value,
            Severity: logServiceSeverity.value,
            Detectability: logServiceDetectability.value,
            // RPN, RiskLevel, ActionRequired are calculated server-side by Apps Script
        };

         // Basic validation
        if (!formData.EquipmentID || !formData.ServiceType || !formData.ServiceDate || !formData.Technician || !formData.WorkPerformed || !formData.Likelihood || !formData.Severity || !formData.Detectability) {
            M.toast({ html: 'Please fill in all required service log fields, including L/S/D.', classes: 'orange darken-2' });
            return;
        }


         try {
            const result = await postData('addServiceLog', formData);
             if (result.status === 'success') {
                M.toast({ html: `Service logged successfully! RPN: ${result.rpn || 'N/A'}`, classes: 'green darken-1' });
                logServiceForm.reset();
                 M.updateTextFields();
                 // Reset RPN display
                 logServiceRpnSpan.textContent = 'N/A';
                 logServiceRiskLevelSpan.textContent = 'N/A';
                 logServiceActionSpan.textContent = 'N/A';
                 M.FormSelect.init(document.querySelectorAll('select')); // Re-init selects
                const modalInstance = M.Modal.getInstance(document.getElementById('modal-log-service'));
                modalInstance.close();
                loadInitialData(); // Refresh data (equipment might have updated dates)
            } else {
                 throw new Error(result.message || 'Failed to log service.');
            }
        } catch (error) {
             // Error toast handled by postData
        }
    }

    /**
     * Handles clicks on action buttons within tables or lists (View, Log).
     */
    function handleActionClick(event) {
        const target = event.target.closest('.action-btn'); // Find the button/icon clicked
        if (!target) return;

        const action = target.dataset.action;
        const equipId = target.dataset.equipId;

        if (action === 'log') {
            // Handled by Materialize modal trigger, but we need to populate the modal title
            const equipName = target.dataset.equipName || 'Equipment';
            logServiceEquipName.textContent = equipName;
            logServiceEquipId.value = equipId;
             // Reset RPN display when opening modal
            logServiceRpnSpan.textContent = 'N/A';
            logServiceRiskLevelSpan.textContent = 'N/A';
            logServiceActionSpan.textContent = 'N/A';
            // Ensure technician dropdown is populated and selects are initialized
            populateTechnicianDropdown(); // Repopulate in case technicians changed
            M.FormSelect.init(logServiceForm.querySelectorAll('select'));
            M.updateTextFields(); // Ensure labels are positioned correctly
        } else if (action === 'view') {
            handleViewDetails(equipId);
        }
        // Add other actions like 'edit', 'delete' here if implemented
    }

    /**
     * Fetches and displays equipment details and service logs in the View modal.
     * @param {string} equipmentId
     */
    async function handleViewDetails(equipmentId) {
        if (!equipmentId) return;

        const modalInstance = M.Modal.getInstance(document.getElementById('modal-view-equipment'));
        viewEquipmentContent.innerHTML = '<div class="progress"><div class="indeterminate"></div></div>'; // Show loading inside modal
        viewEquipmentLogs.innerHTML = '<li class="collection-item center-align">Loading service history...</li>';
        modalInstance.open();

        // Find the equipment details from the cached data
        const equipment = allEquipment.find(e => e.EquipmentID === equipmentId);

        if (equipment) {
            // Format dates nicely
            const purchaseDate = equipment.PurchaseDate ? new Date(equipment.PurchaseDate).toLocaleDateString() : 'N/A';
            const installDate = equipment.InstallationDate ? new Date(equipment.InstallationDate).toLocaleDateString() : 'N/A';
            const lastService = equipment.LastServiceDate ? new Date(equipment.LastServiceDate).toLocaleDateString() : 'N/A';
            const nextService = equipment.NextServiceDate ? new Date(equipment.NextServiceDate).toLocaleDateString() : 'N/A';

            viewEquipmentContent.innerHTML = `
                <div class="row">
                    <div class="col s12 m6"><strong>Name:</strong> ${equipment.Name || 'N/A'}</div>
                    <div class="col s12 m6"><strong>Model:</strong> ${equipment.Model || 'N/A'}</div>
                </div>
                <div class="row">
                    <div class="col s12 m6"><strong>Serial No:</strong> ${equipment.SerialNumber || 'N/A'}</div>
                    <div class="col s12 m6"><strong>Inventory Code:</strong> ${equipment.InventoryCode || 'N/A'}</div>
                </div>
                 <div class="row">
                    <div class="col s12 m6"><strong>Department:</strong> ${equipment.Department || 'N/A'}</div>
                    <div class="col s12 m6"><strong>Location:</strong> ${equipment.Location || 'N/A'}</div>
                </div>
                 <div class="row">
                    <div class="col s12 m6"><strong>Manufacturer:</strong> ${equipment.Manufacturer || 'N/A'}</div>
                    <div class="col s12 m6"><strong>Status:</strong> ${equipment.Status || 'N/A'}</div>
                </div>
                 <div class="row">
                    <div class="col s12 m6"><strong>Purchase Date:</strong> ${purchaseDate}</div>
                    <div class="col s12 m6"><strong>Installation Date:</strong> ${installDate}</div>
                </div>
                 <div class="row">
                    <div class="col s12 m6"><strong>Last Service:</strong> ${lastService}</div>
                    <div class="col s12 m6"><strong>Next Service:</strong> ${nextService}</div>
                </div>
            `;
        } else {
            viewEquipmentContent.innerHTML = '<p class="red-text">Error: Equipment details not found.</p>';
        }

        // Fetch and display service logs
        const serviceLogs = await fetchData('getServiceLogs', { equipmentId: equipmentId });
        viewEquipmentLogs.innerHTML = ''; // Clear loading message

        if (serviceLogs && serviceLogs.length > 0) {
             // Sort logs by date descending
            serviceLogs.sort((a, b) => new Date(b.ServiceDate) - new Date(a.ServiceDate));

            serviceLogs.forEach(log => {
                const li = document.createElement('li');
                li.className = 'collection-item avatar';
                const serviceDate = log.ServiceDate ? new Date(log.ServiceDate).toLocaleDateString() : 'N/A';
                li.innerHTML = `
                    <i class="material-symbols-outlined circle blue">history_edu</i>
                    <span class="title"><strong>${log.ServiceType || 'Service'}</strong> on ${serviceDate} by ${log.Technician || 'N/A'}</span>
                    <p>
                        Work: ${log.WorkPerformed || 'N/A'} <br>
                        Parts: ${log.PartsUsed || 'None'} | Notes: ${log.Notes || 'None'} <br>
                        Risk: L=${log.Likelihood}, S=${log.Severity}, D=${log.Detectability} | RPN: ${log.RPN} | Level: ${log.RiskLevel} | Action: ${log.ActionRequired}
                    </p>
                    <span class="secondary-content grey-text">Log ID: ${log.LogID}</span>
                `;
                viewEquipmentLogs.appendChild(li);
            });
        } else {
            viewEquipmentLogs.innerHTML = '<li class="collection-item center-align">No service history found for this equipment.</li>';
        }
    }


    // --- Initialization Function ---

    /**
     * Loads initial data (equipment and technicians) and renders the UI.
     */
    async function loadInitialData() {
        showLoading();
        // Fetch in parallel
        const [equipmentData, techniciansData] = await Promise.all([
            fetchData('getEquipment'),
            fetchData('getTechnicians')
        ]);

        allEquipment = equipmentData || [];
        allTechnicians = techniciansData || [];

        renderEquipmentTable(allEquipment);
        renderTechniciansTable(allTechnicians);
        populateFilterDropdowns();
        populateTechnicianDropdown(); // Populate for log service modal
        renderDashboard(); // Render dashboard stats and tasks

        // Reinitialize selects after populating them
        M.FormSelect.init(document.querySelectorAll('select'));
        hideLoading();
    }

    // --- Event Listener Setup ---
    // Navigation
    navLinks.forEach(link => link.addEventListener('click', handleNavigation));

    // Equipment Filtering and Search
    equipmentSearchInput.addEventListener('input', filterEquipmentTable);
    departmentFilter.addEventListener('change', filterEquipmentTable);
    statusFilter.addEventListener('change', filterEquipmentTable);

    // Form Submissions
    addEquipmentForm.addEventListener('submit', handleAddEquipment);
    addTechnicianForm.addEventListener('submit', handleAddTechnician);
    logServiceForm.addEventListener('submit', handleLogService);

    // RPN Calculation in Log Service Modal
    logServiceLikelihood.addEventListener('change', updateRpnDisplay);
    logServiceSeverity.addEventListener('change', updateRpnDisplay);
    logServiceDetectability.addEventListener('change', updateRpnDisplay);

    // Action button clicks (using event delegation on table bodies and task list)
    equipmentTableBody.addEventListener('click', handleActionClick);
    priorityTasksList.addEventListener('click', handleActionClick); // Handle clicks on dashboard task buttons


    // --- Initial Load ---
    if (GAS_URL === 'YOUR_DEPLOYED_APPS_SCRIPT_URL') {
         M.toast({ html: 'Error: Please replace YOUR_DEPLOYED_APPS_SCRIPT_URL in script.js', classes: 'red darken-2', displayLength: 10000 });
         console.error("FATAL: GAS_URL not set in script.js. Please deploy your Google Apps Script and paste the URL.");
         // Optionally disable forms or show a persistent error message
         document.querySelectorAll('form button[type="submit"]').forEach(btn => btn.disabled = true);
         hideLoading(); // Hide loading if URL isn't set
    } else {
        loadInitialData();
    }

}); // End DOMContentLoaded


