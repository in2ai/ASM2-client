# Fake for now

USER_ID = 'Unknown user'
USER_ROLE = 'Unknown role'

def authenticate(user_id, user_role):
    global USER_ID, USER_ROLE

    USER_ID = user_id
    USER_ROLE = user_role