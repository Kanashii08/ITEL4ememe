let authToken = null;
let currentUser = null;
let editingCubicleId = null;
let allBookingsCache = [];
let staffBookingsCache = [];

function isSuperAdmin() {
    return currentUser && (currentUser.email || "").toString().toLowerCase() === "admin@bc.com";
}

function showMessage($el, type, text) {
    $el.removeClass("hidden error success").addClass(type).text(text);
}

function hideMessage($el) {
    $el.addClass("hidden").text("");
}

function apiRequest(path, options = {}) {
    const url = `${API_BASE_URL}/${path}`;
    const headers = options.headers || {};
    headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json";
    if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
    }
    return fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw data;
        return data;
    });
}

function updateNav() {
    if (currentUser) {
        $("#nav-auth").addClass("hidden");
        $("#nav-user").removeClass("hidden");
        $("#nav-name").text(`${currentUser.first_name} ${currentUser.last_name}`);
        $("#nav-role").text(currentUser.role).removeClass("admin staff user").addClass(currentUser.role);
        $("#nav-avatar").attr("src", currentUser.avatar_url || "assets/img/default-user.png");
    } else {
        $("#nav-auth").removeClass("hidden");
        $("#nav-user").addClass("hidden");
    }
}

function fillProfileForm() {
    // Safely handle cases where there is no logged-in user yet
    if (!currentUser) return;
    const form = document.getElementById("form-profile");
    if (!form) return;
    form.first_name.value = currentUser.first_name || "";
    form.last_name.value = currentUser.last_name || "";
    form.email.value = currentUser.email || "";
    form.avatar_url.value = currentUser.avatar_url || "";
    form.password.value = "";

    const avatar = document.getElementById("profile-avatar-preview");
    if (avatar) {
        avatar.src = currentUser.avatar_url || "assets/img/default-user.png";
    }
}

function switchToDashboard() {
    $("#section-auth").addClass("hidden");
    $("#section-dashboard").removeClass("hidden");
    $(".role-panel").addClass("hidden");
    if (!currentUser) return;

    const role = currentUser.role;
    $("#dashboard-title").text(`${role.charAt(0).toUpperCase() + role.slice(1)} Dashboard`);

    if (role === "admin") {
        $("#dashboard-subtitle").text("Manage cubicles, bookings, and users.");
        $("#dashboard-admin").removeClass("hidden");
        $(".tab-btn[data-panel='admin-users']").show();
        $("#admin-users").show();
        if (isSuperAdmin()) {
            $("#form-add-user").removeClass("hidden");
        } else {
            $("#form-add-user").addClass("hidden");
        }
        loadCubicles();
        loadAllBookings();
        loadUsers();
    } else if (role === "staff") {
        $("#dashboard-subtitle").text("Manage bookings and cubicles, and help guests.");
        $("#dashboard-staff").removeClass("hidden");
        loadCubicles();
        loadAllBookings();
        loadTodayBookings();
    } else {
        $("#dashboard-subtitle").text("Book a private cubicle and view your reservations.");
        $("#dashboard-user").removeClass("hidden");
        loadCubiclesForSelect();
        loadUserBookings();
    }
}

function switchToAuth() {
    $("#section-dashboard").addClass("hidden");
    $("#section-auth").removeClass("hidden");
}

function persistAuth() {
    if (authToken && currentUser) {
        localStorage.setItem("bookcafe_token", authToken);
        localStorage.setItem("bookcafe_user", JSON.stringify(currentUser));
    } else {
        localStorage.removeItem("bookcafe_token");
        localStorage.removeItem("bookcafe_user");
    }
}

function restoreAuth() {
    const token = localStorage.getItem("bookcafe_token");
    const userJson = localStorage.getItem("bookcafe_user");
    if (!token || !userJson) return;
    authToken = token;
    currentUser = JSON.parse(userJson);
    updateNav();
    switchToDashboard();
}

function loadCubicles() {
    apiRequest("cubicles").then((data) => {
        const list = data.cubicles || [];
        const $adminContainer = $("#admin-cubicles-list");
        const $staffContainer = $("#staff-cubicles-list");

        if ($adminContainer.length) $adminContainer.empty();
        if ($staffContainer.length) $staffContainer.empty();

        if (!list.length) {
            if ($adminContainer.length) $adminContainer.append("<p class='hint'>No cubicles yet. Create one above.</p>");
            if ($staffContainer.length) $staffContainer.append("<p class='hint'>No cubicles yet. Create one above.</p>");
            return;
        }
        list.forEach((c) => {
            const beer = c.has_beer ? "Beer allowed" : "No beer";
            const isAdmin = currentUser && currentUser.role === "admin";
            const canEdit = currentUser && (currentUser.role === "admin" || currentUser.role === "staff");
            let actions = "";
            if (canEdit) {
                actions += `<button class="btn small" onclick="editCubicle(${c.id}, '${c.name.replace(/'/g, "&#39;")}', '${(c.description || "").replace(/'/g, "&#39;")}', ${parseFloat(c.hourly_rate)}, ${c.has_beer ? 1 : 0})">Edit</button>`;
            }
            if (isAdmin) {
                actions += ` <button class="btn small danger" onclick="deleteCubicle(${c.id})">Delete</button>`;
            }
            const actionsHtml = actions
                ? `<div class="list-item-actions">${actions}</div>`
                : "";

            const rowHtml = `
                <div class="list-item">
                    <div class="list-item-info">
                        <strong>${c.name}</strong> - ${c.description || "No description"}<br>
                        <span>${beer}, ₱${parseFloat(c.hourly_rate).toFixed(2)}/hour</span>
                    </div>
                    ${actionsHtml}
                </div>
            `;

            if ($adminContainer.length) $adminContainer.append(rowHtml);
            if ($staffContainer.length) $staffContainer.append(rowHtml);
        });
    }).catch(() => {});
}

function editCubicle(id, name, description, hourlyRate, hasBeer) {
    const form = document.getElementById("form-create-cubicle") || document.getElementById("form-create-cubicle-staff");
    if (!form) return;
    editingCubicleId = id;
    form.name.value = name;
    form.description.value = description || "";
    form.hourly_rate.value = hourlyRate;
    form.has_beer.checked = !!hasBeer;
    $(form).find("button[type='submit']").text("Update cubicle");
}

function deleteCubicle(id) {
    if (!confirm("Are you sure you want to delete this cubicle?")) return;
    apiRequest(`cubicles/${id}`, { method: "DELETE" })
        .then(() => {
            loadCubicles();
        })
        .catch((err) => {
            alert(err.message || "Failed to delete cubicle");
        });
}

function loadCubiclesForSelect() {
    apiRequest("cubicles").then((data) => {
        const list = data.cubicles || [];
        const $select = $("#select-cubicle");
        if (!$select.length) return;
        $select.empty();
        list.forEach((c) => {
            $select.append(`<option value="${c.id}">${c.name} - ₱${parseFloat(c.hourly_rate).toFixed(2)}/hour</option>`);
        });
    }).catch(() => {});
}

function renderBookings($container, bookings) {
    $container.empty();
    if (!bookings.length) {
        $container.append("<p class='hint'>No bookings found.</p>");
        return;
    }
    bookings.forEach((b) => {
        const isStaffOrAdmin = currentUser && (currentUser.role === "staff" || currentUser.role === "admin");
        const isUser = currentUser && currentUser.role === "user";

        let actions = "";

        if (isStaffOrAdmin) {
            // For staff/admin:
            // - pending: show Confirm + Cancel
            // - confirmed: only Cancel
            // - cancelled: no buttons
            if (b.status === "pending") {
                actions = `<div class="list-item-actions">
                    <button class="btn small" onclick="updateBookingStatus(${b.id}, 'confirmed')">Confirm</button>
                    <button class="btn small danger" onclick="updateBookingStatus(${b.id}, 'cancelled')">Cancel</button>
                </div>`;
            } else if (b.status === "confirmed") {
                actions = `<div class="list-item-actions">
                    <button class="btn small danger" onclick="updateBookingStatus(${b.id}, 'cancelled')">Cancel</button>
                </div>`;
            }
        } else if (isUser && b.status !== "confirmed") {
            // Users can cancel their own non-confirmed bookings
            actions = `<div class="list-item-actions">
                <button class="btn small danger" onclick="updateBookingStatus(${b.id}, 'cancelled')">Cancel</button>
            </div>`;
        }

        const hourly = parseFloat(b.hourly_rate || 0);
        const total = typeof b.total_price !== "undefined" ? parseFloat(b.total_price || 0) : 0;

        $container.append(`
            <div class="list-item">
                <div class="list-item-info">
                    <strong>${b.cubicle_name}</strong> - ${b.status}<br>
                    <span>${b.start_time} to ${b.end_time}</span><br>
                    <span>${b.user_name || ""}</span><br>
                    <span>Rate: ₱${hourly.toFixed(2)} / hour</span><br>
                    <span>Total: ₱${total.toFixed(2)}</span>
                </div>
                ${actions}
            </div>
        `);
    });
}

function updateBookingStatus(id, status) {
    apiRequest(`bookings/${id}`, { method: "PUT", body: { status } })
        .then(() => {
            if (!currentUser) return;
            if (currentUser.role === "staff") {
                // Refresh both staff "today" view and the All Bookings tab
                loadTodayBookings();
                loadAllBookings();
            } else {
                loadAllBookings();
            }
            if (currentUser.role === "staff") {
                alert(`Booking ${status}`);
            }
        })
        .catch((err) => {
            alert(err.message || "Failed to update booking");
        });
}

function loadAllBookings() {
    apiRequest("bookings").then((data) => {
        allBookingsCache = data.bookings || [];
        applyBookingsFilter();
        staffBookingsCache = allBookingsCache;
        applyStaffBookingsFilter();
    }).catch(() => {});
}

function applyBookingsFilter() {
    const $input = $("#admin-bookings-search");
    const $status = $("#admin-bookings-status-filter");
    if (!$input.length || !$status.length) return;
    const query = ($input.val() || "").toString().toLowerCase();
    const statusFilter = ($status.val() || "").toString();
    let list = allBookingsCache;

    if (query || statusFilter) {
        list = allBookingsCache.filter((b) => {
            const text = `${b.cubicle_name || ""} ${b.user_name || ""} ${b.status || ""} ${b.start_time || ""}`.toLowerCase();
            if (query && !text.includes(query)) return false;
            if (statusFilter && b.status !== statusFilter) return false;
            return true;
        });
    }

    renderBookings($("#admin-bookings-list"), list);
}

function applyStaffBookingsFilter() {
    const $input = $("#staff-bookings-search");
    const $status = $("#staff-bookings-status-filter");
    const $list = $("#staff-bookings-all-list");
    if (!$input.length || !$status.length || !$list.length) return;

    const query = ($input.val() || "").toString().toLowerCase();
    const statusFilter = ($status.val() || "").toString();
    let list = staffBookingsCache;

    if (query || statusFilter) {
        list = staffBookingsCache.filter((b) => {
            const text = `${b.cubicle_name || ""} ${b.user_name || ""} ${b.status || ""} ${b.start_time || ""}`.toLowerCase();
            if (query && !text.includes(query)) return false;
            if (statusFilter && b.status !== statusFilter) return false;
            return true;
        });
    }

    renderBookings($list, list);
}

function loadTodayBookings() {
    apiRequest("bookings/today").then((data) => {
        renderBookings($("#staff-bookings-list"), data.bookings || []);
    }).catch(() => {});
}

function loadUserBookings() {
    apiRequest("bookings/mine").then((data) => {
        renderBookings($("#user-bookings-list"), data.bookings || []);
    }).catch(() => {});
}

function loadUsers() {
    apiRequest("users").then((data) => {
        const users = data.users || [];
        const $container = $("#admin-users-list");
        $container.empty();
        if (!users.length) {
            $container.append("<p class='hint'>No users found.</p>");
            return;
        }
        users.forEach((u) => {
            const isSelf = currentUser && String(u.id) === String(currentUser.id);
            const isPrimaryAdmin = u.id === 1;
            const isAdminAccount = (u.role || "") === "admin";
            const canEditCredentials = !isSelf && currentUser && (currentUser.role === "admin" || isSuperAdmin());
            $container.append(`
                <div class="list-item">
                    <div class="list-item-info">
                        <strong>${u.first_name} ${u.last_name}</strong>
                        <span class="badge ${u.role}">${u.role}</span><br>
                        <span>${u.email}</span>
                    </div>
                    <div class="list-item-actions">
                        ${canEditCredentials ? `<button class="btn small" onclick="openEditUserModal(${u.id}, '${u.first_name}', '${u.last_name}', '${u.email}', '${u.role}')">Edit</button>` : ''}
                        ${(isSelf || (!isSuperAdmin() && isAdminAccount)) ? '' : `<button class="btn small" onclick="openRoleModal(${u.id}, '${u.first_name} ${u.last_name}', '${u.role}')">Change Role</button>`}
                        ${(isPrimaryAdmin || isSelf) ? '' : `<button class="btn small danger" onclick="deleteUser(${u.id})">Delete</button>`}
                    </div>
                </div>
            `);
        });
    }).catch(() => {});
}

function openEditUserModal(id, firstName, lastName, email, role) {
    const form = document.getElementById("form-edit-user");
    if (!form) return;
    form.user_id.value = id;
    form.first_name.value = firstName || "";
    form.last_name.value = lastName || "";
    form.email.value = email || "";
    form.password.value = "";
    form.avatar_url.value = "";
    form.role.value = role || "user";
    $("#modal-edit-user").removeClass("hidden");
}

function closeEditUserModal() {
    $("#modal-edit-user").addClass("hidden");
}

function openRoleModal(userId, name, currentRole) {
    $("#form-change-role input[name='user_id']").val(userId);
    $("#modal-user-info").text(`User: ${name}`);
    $("#form-change-role select[name='role']").val(currentRole);
    $("#form-change-role").data("target-user-id", String(userId));
    $("#form-change-role").data("target-user-role", String(currentRole || ""));
    $("#modal-role").removeClass("hidden");
}

function closeRoleModal() {
    $("#modal-role").addClass("hidden");
}

function deleteUser(userId) {
    if (currentUser && String(userId) === String(currentUser.id)) {
        alert("You cannot delete your own account.");
        return;
    }
    if (!confirm("Are you sure you want to delete this user?")) return;
    apiRequest(`users/${userId}`, { method: "DELETE" }).then(() => {
        loadUsers();
    }).catch((err) => {
        alert(err.message || "Failed to delete user");
    });
}

$(function () {
    // Verification success handler: show message and return user to login UI
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("verified") === "1") {
        const email = (params.get("email") || "").toString();
        $("#section-dashboard").addClass("hidden");
        $("#section-auth").removeClass("hidden");
        $(".tab-btn[data-tab='login']").click();

        if (email) {
            const form = document.getElementById("form-login");
            if (form && form.email) {
                form.email.value = email;
            }
        }

        showMessage($("#verify-message"), "success", "Email verified successfully! You can now log in.");

        // Clean URL (remove query params)
        try {
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {}
    }

    restoreAuth();

    // Auth tabs
    $(".tab-btn[data-tab]").on("click", function () {
        const tab = $(this).data("tab");
        $(".tab-btn[data-tab]").removeClass("active");
        $(this).addClass("active");
        $(".tab").removeClass("active");
        $(`#tab-${tab}`).addClass("active");
    });

    // Dashboard tabs (admin & staff) - scoped within the active role panel
    $(document).on("click", ".tab-btn[data-panel]", function () {
        const panel = $(this).data("panel");
        const $rolePanel = $(this).closest(".role-panel");
        $rolePanel.find(".tab-btn[data-panel]").removeClass("active");
        $(this).addClass("active");
        $rolePanel.find(".panel-content").removeClass("active");
        $rolePanel.find(`#${panel}`).addClass("active");
    });

    $("#btn-show-login").on("click", () => {
        $(".tab-btn[data-tab='login']").click();
    });

    $("#btn-show-register").on("click", () => {
        $(".tab-btn[data-tab='register']").click();
    });

    // Profile button: open profile modal and prefill (no dashboard card)
    $("#btn-profile").on("click", () => {
        if (!currentUser) return;
        $("#section-auth").addClass("hidden");
        $("#section-dashboard").removeClass("hidden");
        fillProfileForm();
        const $msg = $("#profile-message");
        hideMessage($msg);
        $("#modal-profile").removeClass("hidden");
    });

    // Bookings search & status filter (admin)
    $("#admin-bookings-search").on("input", applyBookingsFilter);
    $("#admin-bookings-status-filter").on("change", applyBookingsFilter);

    // Bookings search & status filter (staff)
    $("#staff-bookings-search").on("input", applyStaffBookingsFilter);
    $("#staff-bookings-status-filter").on("change", applyStaffBookingsFilter);

    // Close profile modal
    $("#btn-cancel-profile").on("click", () => {
        $("#modal-profile").addClass("hidden");
    });

    $("#form-login").on("submit", function (e) {
        e.preventDefault();
        hideMessage($("#auth-message"));
        const payload = {
            email: this.email.value,
            password: this.password.value,
        };
        apiRequest("auth/login", { method: "POST", body: payload }).then((data) => {
            authToken = data.token;
            currentUser = data.user;
            persistAuth();
            updateNav();
            switchToDashboard();
        }).catch((err) => {
            showMessage($("#auth-message"), "error", err.message || "Invalid credentials");
        });
    });

    $("#form-register").on("submit", function (e) {
        e.preventDefault();
        hideMessage($("#auth-message"));
        const payload = {
            first_name: this.first_name.value,
            last_name: this.last_name.value,
            email: this.email.value,
            password: this.password.value,
        };
        apiRequest("auth/register", { method: "POST", body: payload }).then(() => {
            showMessage($("#auth-message"), "success", "Account created! Please verify your email before logging in.");
            $(".tab-btn[data-tab='login']").click();
            this.reset();
        }).catch((err) => {
            showMessage($("#auth-message"), "error", err.message || "Registration failed");
        });
    });

    $("#btn-logout").on("click", () => {
        authToken = null;
        currentUser = null;
        persistAuth();
        updateNav();
        switchToAuth();
    });

    $("#form-create-cubicle").on("submit", function (e) {
        e.preventDefault();
        const payload = {
            name: this.name.value,
            description: this.description.value,
            hourly_rate: this.hourly_rate.value,
            has_beer: this.has_beer.checked ? 1 : 0,
        };

        const isEditing = editingCubicleId !== null;
        const method = isEditing ? "PUT" : "POST";
        const path = isEditing ? `cubicles/${editingCubicleId}` : "cubicles";

        apiRequest(path, { method, body: payload }).then(() => {
            this.reset();
            editingCubicleId = null;
            $(this).find("button[type='submit']").text("Add cubicle");
            loadCubicles();
        }).catch((err) => {
            alert(err.message || "Failed to save cubicle");
        });
    });

    $("#form-create-cubicle-staff").on("submit", function (e) {
        e.preventDefault();
        const payload = {
            name: this.name.value,
            description: this.description.value,
            hourly_rate: this.hourly_rate.value,
            has_beer: this.has_beer.checked ? 1 : 0,
        };

        const isEditing = editingCubicleId !== null;
        const method = isEditing ? "PUT" : "POST";
        const path = isEditing ? `cubicles/${editingCubicleId}` : "cubicles";

        apiRequest(path, { method, body: payload }).then(() => {
            this.reset();
            editingCubicleId = null;
            $(this).find("button[type='submit']").text("Add cubicle");
            loadCubicles();
        }).catch((err) => {
            alert(err.message || "Failed to save cubicle");
        });
    });

    $("#form-create-booking").on("submit", function (e) {
        e.preventDefault();
        const payload = {
            cubicle_id: this.cubicle_id.value,
            start_time: this.start_time.value,
            duration: this.duration.value,
        };
        apiRequest("bookings", { method: "POST", body: payload }).then(() => {
            this.reset();
            loadUserBookings();
            alert("Booking created successfully!");
        }).catch((err) => {
            alert(err.message || "Booking failed");
        });
    });

    $("#form-staff-lookup").on("submit", function (e) {
        e.preventDefault();
        const email = this.email.value;
        apiRequest(`bookings/lookup?email=${encodeURIComponent(email)}`).then((data) => {
            renderBookings($("#staff-lookup-results"), data.bookings || []);
        }).catch(() => {});
    });

    $("#form-change-role").on("submit", function (e) {
        e.preventDefault();
        const userId = this.user_id.value;
        const role = this.role.value;

        const targetId = String($(this).data("target-user-id") || "");
        const targetRole = String($(this).data("target-user-role") || "");

        if (currentUser && String(currentUser.id) === String(userId)) {
            alert("You cannot change your own role.");
            return;
        }
        if (targetRole === "admin" && !isSuperAdmin()) {
            alert("You cannot change the role of an admin account.");
            return;
        }
        if (targetId && targetId !== String(userId)) {
            alert("Invalid role change request.");
            return;
        }

        apiRequest(`users/${userId}`, { method: "PUT", body: { role } }).then(() => {
            closeRoleModal();
            loadUsers();
        }).catch((err) => {
            alert(err.message || "Failed to update role");
        });
    });

    $("#form-add-user").on("submit", function (e) {
        e.preventDefault();
        if (!isSuperAdmin()) {
            alert("Only the super admin (admin@bc.com) can add users.");
            return;
        }
        const payload = {
            first_name: this.first_name.value,
            last_name: this.last_name.value,
            email: this.email.value,
            password: this.password.value,
            role: this.role.value,
        };
        if (this.avatar_url && this.avatar_url.value) {
            payload.avatar_url = this.avatar_url.value;
        }

        apiRequest("users", { method: "POST", body: payload }).then(() => {
            this.reset();
            loadUsers();
            alert("User added successfully!");
        }).catch((err) => {
            alert(err.message || "Failed to add user");
        });
    });

    $("#btn-cancel-role").on("click", closeRoleModal);

    $("#btn-cancel-edit-user").on("click", closeEditUserModal);

    $("#form-profile").on("submit", function (e) {
        e.preventDefault();
        if (!currentUser) return;
        const $msg = $("#profile-message");
        hideMessage($msg);

        const payload = {
            first_name: this.first_name.value,
            last_name: this.last_name.value,
            email: this.email.value,
            avatar_url: this.avatar_url.value,
        };
        if (this.password.value) {
            payload.password = this.password.value;
        }

        apiRequest("profile", { method: "PUT", body: payload }).then(() => {
            currentUser.first_name = payload.first_name;
            currentUser.last_name = payload.last_name;
            currentUser.email = payload.email;
            if (payload.avatar_url) {
                currentUser.avatar_url = payload.avatar_url;
            }
            persistAuth();
            updateNav();
            fillProfileForm();
            showMessage($msg, "success", "Profile updated successfully.");
        }).catch((err) => {
            showMessage($msg, "error", err.message || "Failed to update profile");
        });
    });

    // Avatar file selection preview and upload
    $("#profile-avatar-file").on("change", function () {
        const file = this.files && this.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        $("#profile-avatar-preview").attr("src", url);
    });

    $("#btn-upload-avatar").on("click", function () {
        const input = document.getElementById("profile-avatar-file");
        const file = input.files && input.files[0];
        const $msg = $("#profile-message");
        hideMessage($msg);
        if (!file) {
            showMessage($msg, "error", "Please choose an image first.");
            return;
        }
        if (!currentUser) {
            showMessage($msg, "error", "You must be logged in.");
            return;
        }

        const formData = new FormData();
        formData.append("avatar", file);

        const url = `${API_BASE_URL}/profile/avatar`;
        const headers = {};
        if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
        }

        fetch(url, {
            method: "POST",
            headers,
            body: formData,
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw data;
                return data;
            })
            .then((data) => {
                if (data.avatar_url) {
                    currentUser.avatar_url = data.avatar_url;
                    $("#profile-avatar-preview").attr("src", data.avatar_url);
                    $("#nav-avatar").attr("src", data.avatar_url);
                    const form = document.getElementById("form-profile");
                    if (form && form.avatar_url) {
                        form.avatar_url.value = data.avatar_url;
                    }
                    persistAuth();
                    updateNav();
                    showMessage($msg, "success", "Avatar uploaded successfully.");
                } else {
                    showMessage($msg, "error", data.message || "Upload failed");
                }
            })
            .catch((err) => {
                showMessage($msg, "error", err.message || "Failed to upload avatar");
            });
    });

    $("#form-edit-user").on("submit", function (e) {
        e.preventDefault();
        const id = this.user_id.value;
        if (!id) return;

        const payload = {
            first_name: this.first_name.value,
            last_name: this.last_name.value,
            email: this.email.value,
            role: this.role.value,
        };

        if (this.password.value) {
            payload.password = this.password.value;
        }
        if (this.avatar_url.value) {
            payload.avatar_url = this.avatar_url.value;
        }

        apiRequest(`users/${id}`, { method: "PUT", body: payload })
            .then(() => {
                closeEditUserModal();
                loadUsers();
            })
            .catch((err) => {
                alert(err.message || "Failed to update user");
            });
    });
});