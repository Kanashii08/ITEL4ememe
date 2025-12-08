let authToken = null;
let currentUser = null;

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
    if (!currentUser) return;
    const form = document.getElementById("form-profile");
    form.first_name.value = currentUser.first_name || "";
    form.last_name.value = currentUser.last_name || "";
    form.email.value = currentUser.email || "";
    form.avatar_url.value = currentUser.avatar_url || "";
    form.password.value = "";
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
        loadCubicles();
        loadAllBookings();
        loadUsers();
    } else if (role === "staff") {
        $("#dashboard-subtitle").text("View today's bookings and help guests.");
        $("#dashboard-staff").removeClass("hidden");
        loadTodayBookings();
    } else {
        $("#dashboard-subtitle").text("Book a private cubicle and view your reservations.");
        $("#dashboard-user").removeClass("hidden");
        loadCubiclesForSelect();
        loadUserBookings();
    }

    $("#dashboard-profile").removeClass("hidden");
    fillProfileForm();
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
        const $container = $("#admin-cubicles-list");
        $container.empty();
        if (!list.length) {
            $container.append("<p class='hint'>No cubicles yet. Create one above.</p>");
            return;
        }
        list.forEach((c) => {
            const beer = c.has_beer ? "Beer allowed" : "No beer";
            $container.append(`
                <div class="list-item">
                    <div class="list-item-info">
                        <strong>${c.name}</strong> - ${c.description || "No description"}<br>
                        <span>${beer}, ₱${parseFloat(c.hourly_rate).toFixed(2)}/hour</span>
                    </div>
                </div>
            `);
        });
    }).catch(() => {});
}

function loadCubiclesForSelect() {
    apiRequest("cubicles").then((data) => {
        const list = data.cubicles || [];
        const $select = $("#select-cubicle");
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
        $container.append(`
            <div class="list-item">
                <div class="list-item-info">
                    <strong>${b.cubicle_name}</strong> - ${b.status}<br>
                    <span>${b.start_time} to ${b.end_time}</span><br>
                    <span>${b.user_name || ""}</span>
                </div>
            </div>
        `);
    });
}

function loadAllBookings() {
    apiRequest("bookings").then((data) => {
        renderBookings($("#admin-bookings-list"), data.bookings || []);
    }).catch(() => {});
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
            const isPrimaryAdmin = u.id === 1;
            $container.append(`
                <div class="list-item">
                    <div class="list-item-info">
                        <strong>${u.first_name} ${u.last_name}</strong>
                        <span class="badge ${u.role}">${u.role}</span><br>
                        <span>${u.email}</span>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn small" onclick="openRoleModal(${u.id}, '${u.first_name} ${u.last_name}', '${u.role}')">Change Role</button>
                        ${isPrimaryAdmin ? '' : `<button class="btn small danger" onclick="deleteUser(${u.id})">Delete</button>`}
                    </div>
                </div>
            `);
        });
    }).catch(() => {});
}

function openRoleModal(userId, name, currentRole) {
    $("#form-change-role input[name='user_id']").val(userId);
    $("#modal-user-info").text(`User: ${name}`);
    $("#form-change-role select[name='role']").val(currentRole);
    $("#modal-role").removeClass("hidden");
}

function closeRoleModal() {
    $("#modal-role").addClass("hidden");
}

function deleteUser(userId) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    apiRequest(`users/${userId}`, { method: "DELETE" }).then(() => {
        loadUsers();
    }).catch((err) => {
        alert(err.message || "Failed to delete user");
    });
}

$(function () {
    restoreAuth();

    // Auth tabs
    $(".tab-btn[data-tab]").on("click", function () {
        const tab = $(this).data("tab");
        $(".tab-btn[data-tab]").removeClass("active");
        $(this).addClass("active");
        $(".tab").removeClass("active");
        $(`#tab-${tab}`).addClass("active");
    });

    // Admin dashboard tabs
    $(".tab-btn[data-panel]").on("click", function () {
        const panel = $(this).data("panel");
        $(".tab-btn[data-panel]").removeClass("active");
        $(this).addClass("active");
        $(".panel-content").removeClass("active");
        $(`#${panel}`).addClass("active");
    });

    $("#btn-show-login").on("click", () => {
        $(".tab-btn[data-tab='login']").click();
    });

    $("#btn-show-register").on("click", () => {
        $(".tab-btn[data-tab='register']").click();
    });

    // Profile button: scroll to profile section on dashboard
    $("#btn-profile").on("click", () => {
        if (!currentUser) return;
        $("#section-auth").addClass("hidden");
        $("#section-dashboard").removeClass("hidden");
        const profile = document.getElementById("dashboard-profile");
        if (profile) {
            profile.scrollIntoView({ behavior: "smooth" });
        }
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
            showMessage($("#auth-message"), "success", "Account created! You can now log in.");
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
        apiRequest("cubicles", { method: "POST", body: payload }).then(() => {
            this.reset();
            loadCubicles();
        }).catch(() => {});
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
        apiRequest(`users/${userId}`, { method: "PUT", body: { role } }).then(() => {
            closeRoleModal();
            loadUsers();
        }).catch((err) => {
            alert(err.message || "Failed to update role");
        });
    });

    $("#btn-cancel-role").on("click", closeRoleModal);

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
});