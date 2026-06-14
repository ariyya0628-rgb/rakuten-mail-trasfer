USER_ID = "me"
SPAM_LABEL_ID = "SPAM"
INBOX_LABEL_ID = "INBOX"


def get_existing_filters(service):
    response = service.users().settings().filters().list(userId=USER_ID).execute()
    return response.get("filter", [])


def build_filter_body(filter_definition, label_ids):
    action_definition = filter_definition.get("action", {})
    action = {}

    label_name = action_definition.get("add_label")
    if label_name:
        if label_name not in label_ids:
            raise ValueError(f"ラベルが見つかりません: {label_name}")
        action["addLabelIds"] = [label_ids[label_name]]

    remove_label_ids = []
    if action_definition.get("never_spam"):
        remove_label_ids.append(SPAM_LABEL_ID)
    if action_definition.get("skip_inbox"):
        remove_label_ids.append(INBOX_LABEL_ID)
        remove_label_ids.append("UNREAD")
    if remove_label_ids:
        action["removeLabelIds"] = remove_label_ids

    return {
        "criteria": dict(filter_definition.get("criteria", {})),
        "action": action,
    }


def normalize_filter_body(filter_body):
    criteria = {
        key: value
        for key, value in filter_body.get("criteria", {}).items()
        if value not in (None, "", [])
    }
    action = {
        key: sorted(value) if isinstance(value, list) else value
        for key, value in filter_body.get("action", {}).items()
        if value not in (None, "", [])
    }
    return {"criteria": criteria, "action": action}


def filter_exists(existing_filters, desired_filter_body):
    desired = normalize_filter_body(desired_filter_body)
    for existing_filter in existing_filters:
        existing = normalize_filter_body(existing_filter)
        if existing == desired:
            return True
    return False


def create_filter(service, filter_body):
    return service.users().settings().filters().create(
        userId=USER_ID,
        body=filter_body,
    ).execute()


def delete_filter(service, filter_id):
    return service.users().settings().filters().delete(
        userId=USER_ID,
        id=filter_id,
    ).execute()


def describe_criteria(criteria):
    if "to" in criteria:
        return f"to:{criteria['to']}"
    if "from" in criteria:
        return f"from:{criteria['from']}"
    if "subject" in criteria:
        return f"subject:{criteria['subject']}"
    if "query" in criteria:
        return criteria["query"]
    return str(criteria)


def ensure_filters(service, filter_definitions, label_ids):
    existing_filters = get_existing_filters(service)
    results = []

    for filter_definition in filter_definitions:
        filter_body = build_filter_body(filter_definition, label_ids)
        description = describe_criteria(filter_body["criteria"])

        if filter_exists(existing_filters, filter_body):
            results.append({"status": "SKIP", "criteria": description})
            continue

        created_filter = create_filter(service, filter_body)
        existing_filters.append(created_filter)
        results.append({"status": "OK", "criteria": description})

    return results


def delete_obsolete_filters(service, filter_definitions, label_ids):
    existing_filters = get_existing_filters(service)
    results = []

    for filter_definition in filter_definitions:
        filter_body = build_filter_body(filter_definition, label_ids)
        description = describe_criteria(filter_body["criteria"])
        desired = normalize_filter_body(filter_body)
        deleted_count = 0

        for existing_filter in existing_filters:
            if normalize_filter_body(existing_filter) != desired:
                continue

            delete_filter(service, existing_filter["id"])
            deleted_count += 1

        if deleted_count:
            results.append({"status": "OK", "criteria": description, "count": deleted_count})
        else:
            results.append({"status": "SKIP", "criteria": description, "count": 0})

    return results
