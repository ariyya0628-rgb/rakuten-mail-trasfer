USER_ID = "me"


def get_existing_labels(service):
    response = service.users().labels().list(userId=USER_ID).execute()
    return {label["name"]: label["id"] for label in response.get("labels", [])}


def create_label(service, name):
    body = {
        "name": name,
        "labelListVisibility": "labelShow",
        "messageListVisibility": "show",
    }
    response = service.users().labels().create(userId=USER_ID, body=body).execute()
    return response["id"]


def ensure_labels(service, label_names):
    existing_labels = get_existing_labels(service)
    label_ids = dict(existing_labels)
    results = []

    for name in label_names:
        if name in label_ids:
            results.append({"status": "SKIP", "name": name, "id": label_ids[name]})
            continue

        label_id = create_label(service, name)
        label_ids[name] = label_id
        results.append({"status": "OK", "name": name, "id": label_id})

    return label_ids, results
