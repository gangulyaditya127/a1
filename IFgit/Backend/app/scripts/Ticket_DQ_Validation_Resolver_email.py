import cx_Oracle
import smtplib, ssl
import os,glob
import re
import datetime
from pytz import timezone
import config as db_con
import numpy as np
import pandas as pd
from os.path import basename
from cryptography.fernet import Fernet
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

def send_email(html,to_add, on_off_site):
        today = datetime.datetime.now().strftime("%d %b %Y")
        from_add = db_con.Send_Mail_From["Mail_From"]
        to_list = to_add +',' + db_con.Send_Mail_CC["Mail_CC"] +','+from_add
        # Create message container - the correct MIME type is multipart/alternative.
        msg = MIMEMultipart('alternative')
        msg['Subject'] = on_off_site + " Ticket Resolution Description Template Validation Email - "+ str(today)
        msg['From'] = from_add
        msg['To'] = to_add
        msg['CC'] = db_con.Send_Mail_CC["Mail_CC"]
        msg['BCC'] = from_add
        # Create the body of the message (a plain-text and an HTML version).
        # Record the MIME types of both parts - text/plain and text/html.
        part2 = MIMEText(html, 'html')

        # Attach parts into message container.
        # According to RFC 2046, the last part of a multipart message, in this case
        # the HTML message, is best and preferred.
        msg.attach(part2)
        
        # Send the message via local SMTP server.
        s = smtplib.SMTP('imbapprelay-restricted.wlb2.nam.nsroot.net:25')
        
        #s.login(from_add, db_con.Smtp_detail["password"])
        # sendmail function takes 3 arguments: sender's address, recipient's address
        # and message to send - here it is sent as one string.
        s.sendmail(from_add, to_list.split(','), msg.as_string())
        s.quit()

def html_template(resolver_name, newdf):
    html = """ <script type='text/javascript'>
  window.onload = function() {
    const thead = document.querySelectorAll('.table > thead');
    thead.forEach(e => e.classList.add('gridtable'));
  }
</script><style type="text/css">
    pre {
            font-family: Calibri (Body);
            font-size:10px;
            color: #0033cc;
    }
    table.dataframe {
            font-family: Arial, Helvetica, sans-serif;
            font-size:10px;
            color:#333333;
            border-width: 1px;
            border-color: #666666;
            border-collapse: collapse;
    	width:70%;
    }
    table.maintable {
            font-family: Arial, Helvetica, sans-serif;
            font-size:10px;
            color:#333333;
            border-width: 2px black solid;
            border-color: #666666;
            border-collapse: collapse;
    	width:70%;
    }
    table.dataframe th {
            border-width: 1px;
            padding: 3px 10px;
            border-style: solid;
    	color: white;
            background-color: #3972db;
    }
    table.dataframe td {
            border-width: 1px;
            padding: 3px 10px;
            border-style: solid;
            border-color: #666666;
            background-color: #ffffff;
    }
    
    table.dataframe .AMBER {
            background-color: #ffc200;
		
    }
    </style>
    <html>
    <head></head>
    <body> <h5><span style="font-weight:normal;font-family: Calibri (Body);font-size:10px;">Hi """ + resolver_name + """,</span><br></h5>
    <h5><span style="font-weight:normal;font-family: Calibri (Body);font-size:10px;">It has been observed that the resolution description provided by you to the Incident is not following required template.</span></h5><br>
    <h5><span style="font-weight:normal;font-family: Calibri (Body);font-size:10px;">Please update the resoultion description for the below Incident as per the <a href="https://sd-4b3e-cad0.nam.nsroot.net:6001/Mexico_Incidents_RCA_Template_Generator.html">template!</a>. </span></h5>
    <table border="1" class="dataframe">
        <thead>
        <tr style="text-align: right;">
          <th>TICKET_TYPE</th>
          <th>TICKET_NUMBER</th>
          <th>TITLE</th>
          <th>CSI_ID</th>
          <th>RESOLVED_BY</th>
          <th>RESOLVED (MST)</th>
          <th>TICKET_STATE</th>
          <th>ALERT_CATEGORY</th>
          <th>TEMPLATE TAG</th>
          <th>ROOT CAUSE CATEGORY</th>
          <th>ROOT CAUSE SUB CATEGORY</th>
        </tr>
        </thead>
        <tbody>"""
    
    NOT_MATCHED_STR = 'Not Matched'
    COL_TEMPLATE_TAG = 'TEMPLATE TAG'
    COL_ROOT_CAUSE_CATEGORY = 'ROOT CAUSE CATEGORY'
    COL_ROOT_CAUSE_SUB_CATEGORY = 'ROOT CAUSE SUB CATEGORY'
    table_col_opening_tag = """<td>"""
    table_col_closing_tag = """</td>"""
    table_col_closing_opening_tag = """</td><td>"""
    

    for index, row in newdf.iterrows():
        html=html+"""<tr><td>"""+str(row['TICKET_TYPE'])+ table_col_closing_tag
        if(row['TICKET_TYPE']=='INCIDENT'):
            html=html+"""<td><a href="https://servicemanagement.citigroup.net/incident.do?sys_id=""" + str(row['TICKET_NO']) + """">""" + row['TICKET_NO'] + """</a></td>"""
        else:
            html=html+"""<td><a href="https://servicemanagement.citigroup.net/nav_to.do?uri=u_request.do?sys_id=""" + str(row['TICKET_NO']) + """">""" + row['TICKET_NO'] + """</a></td>"""   
        
        TITLE = row['TITLE'].replace('<', '&lt;')
        TITLE = TITLE.replace('>', '&gt;')
        
        html = html + """<td>""" + str(TITLE)+ table_col_closing_opening_tag + str(row['CSI_ID']) + table_col_closing_opening_tag + str(row['RESOLVED_BY']) + table_col_closing_opening_tag + str(row['RESOLVED']) + table_col_closing_opening_tag + str(row['TICKET_STATE']) + table_col_closing_opening_tag + str(row['ALERT_CATGORY_DER']) + table_col_closing_tag

        if(row[COL_TEMPLATE_TAG] == NOT_MATCHED_STR):
            html=html+"""<td class="AMBER">"""+ row[COL_TEMPLATE_TAG] + table_col_closing_tag 
        else:
            html=html+ table_col_opening_tag + row[COL_TEMPLATE_TAG] + table_col_closing_tag 
        if(row[COL_ROOT_CAUSE_CATEGORY] == NOT_MATCHED_STR):
            html=html+"""<td class="AMBER">"""+ row[COL_ROOT_CAUSE_CATEGORY]+ table_col_closing_tag 
        else:
            html=html+ table_col_opening_tag + row[COL_ROOT_CAUSE_CATEGORY] + table_col_closing_tag  
        if(row[COL_ROOT_CAUSE_SUB_CATEGORY]== NOT_MATCHED_STR):
            html=html+""" <td class="AMBER">"""+ str(row[COL_ROOT_CAUSE_SUB_CATEGORY]) + table_col_closing_tag 
        else:
            html=html+ table_col_opening_tag + str(row[COL_ROOT_CAUSE_SUB_CATEGORY]) + table_col_closing_tag 
        html=html+"""</tr>\n"""
        
    html=html+ """</tbody></table>
        <h5><span style="font-weight:normal;font-family: Calibri (Body);font-size:10px;">Thanks &amp; Regards,</span><br>
    <span style="font-weight:bold;font-family: Calibri (Body);font-size:10px;">Automation Team</span></h5></body></html>                </body>
    </html>"""
    return html

#cx_Oracle.init_oracle_client(lib_dir=r"C:\instantclient_19_9")    
conn = None
def db_connection():
    if(db_con.Config_DB["ENV"] == "DEV"):
        dsn_tns=cx_Oracle.makedsn(db_con.Config_DB["DB_Server"], db_con.Config_DB["Port"], sid=db_con.Config_DB["SID"])
    else:
        dsn_tns=cx_Oracle.makedsn(db_con.Config_DB["DB_Server"], db_con.Config_DB["Port"], service_name=db_con.Config_DB["SERVICE_NAME"])

    global conn
    conn=cx_Oracle.connect(user=db_con.Config_DB["User_Login_ID"], password= db_con.Config_DB["User_pwd"], dsn=dsn_tns)
    c=conn.cursor()
    query="SELECT 'INCIDENT', INC, TITLE, CSI_ID, RESOLVED_NAME , RESOLVED_AT, '', INC_STATE, '', RESOLVED_BY, ASSIGNMENT_GRP, CONTACT_TYPE, CREATED_DT, CREATED_BY, CONTACT_SOEID, RESOLUTION_DESCRIPTION, B.COUNTRY FROM ZROBOT_INC_RESOLUTION_DETAILS A, ZDQ_ON_OFF_SITE B WHERE A.RESOLVED_BY = B.SOEID AND A.TEMPLATE_VALIDATED = 'N'"

    result=c.execute(query).fetchall()
    c.close()
    #conn.close()
    return result

# Users Pattern
# Reusable regex fragments to reduce complexity
START_PATTERN = r"&lt;Issue\s+Description&gt;&gt;(.*)"
FIELD_PATTERN = r"\s*&lt;&lt;{}\s*&gt;&gt;(.*)"

# Final regex (SonarQube-compliant, logic unchanged)
user = (
    START_PATTERN +
    FIELD_PATTERN.format("Root\s+Cause\s+Category") +
    FIELD_PATTERN.format("Root\s+Cause\s+Sub\s+Category") +
    FIELD_PATTERN.format("Root\s+Cause\s+Analysis") +
    FIELD_PATTERN.format("Business\s+Impact") +
    FIELD_PATTERN.format("Impacted\s+Application") +
    FIELD_PATTERN.format("Component\s+Name") +
    FIELD_PATTERN.format("Number\s+of\s+Customers") +
    FIELD_PATTERN.format("Issue\s+Identified") +
    FIELD_PATTERN.format("Temp\s+Fix") +
    FIELD_PATTERN.format("Perm\s+Fix") +
    FIELD_PATTERN.format("Preventive\s+Actions") +
    FIELD_PATTERN.format("New\s+Scope\s+Addition\s+Flag") +
    r"\s*"
)
# System Pattern
# Build system regex incrementally to reduce regex complexity
system = (
    FIELD_PATTERN.format("Root\s+Cause\s+Category") +
    FIELD_PATTERN.format("Root\s+Cause\s+Sub\s+Category") +
    FIELD_PATTERN.format("Root\s+Cause\s+Desc") +
    FIELD_PATTERN.format("File\/Table\/Feed\s+ID\s+Name") +
    FIELD_PATTERN.format("Error\s+Message") +
    FIELD_PATTERN.format("Release\s+Related") +
    FIELD_PATTERN.format("Temp\s+Fix") +
    FIELD_PATTERN.format("Perm\s+Fix") +
    FIELD_PATTERN.format("New\s+Scope\s+Addition\s+Flag") +
    r"\s*"
)


# Template match or not match checking for User and System
def user_match(str0):# User Match
    ISSUE_DESCRIPTION = ''
    ROOT_CAUSE_CATEGORY = ''
    ROOT_CAUSE_SUB_CATEGORY = ''
    ROOT_CAUSE_ANALYSIS = ''
    BUSINESS_IMPACT = ''
    IMPACTED_APPLICATION = ''
    COMPONENT_NAME = ''
    NUMBER_OF_CUSTOMERS = ''
    ISSUE_IDENTIFIED = ''
    TEMP_FIX = ''
    PERM_FIX = ''
    PREVENTIVE_ACTIONS = ''
    NEW_SCOPE_ADDITION_FLAG = ''
    myre = re.compile(user,re.IGNORECASE)
    str0 = re.sub(r"[\n\r\t\xa0]", "", str0)
    match_result = myre.search(str0)
    try:
        if match_result is not None:
            IS_COMPLIANT = "Y"
            ISSUE_DESCRIPTION = match_result.group(1).strip()
            ROOT_CAUSE_CATEGORY = match_result.group(2)
            ROOT_CAUSE_SUB_CATEGORY = match_result.group(3)
            ROOT_CAUSE_ANALYSIS = match_result.group(4).strip()
            BUSINESS_IMPACT = match_result.group(5).strip()
            IMPACTED_APPLICATION = match_result.group(6).strip()
            COMPONENT_NAME = match_result.group(7).strip()
            NUMBER_OF_CUSTOMERS = match_result.group(8).strip()
            ISSUE_IDENTIFIED = match_result.group(9).strip()
            TEMP_FIX = match_result.group(10).strip()
            PERM_FIX = match_result.group(11).strip()
            PREVENTIVE_ACTIONS = match_result.group(12).strip()
            NEW_SCOPE_ADDITION_FLAG = match_result.group(13).strip()[0]
            if (NEW_SCOPE_ADDITION_FLAG != 'N' and NEW_SCOPE_ADDITION_FLAG != 'Y') or (NUMBER_OF_CUSTOMERS.isdigit() != True and NUMBER_OF_CUSTOMERS != "NA"):
                IS_COMPLIANT = "N"
                NUMBER_OF_CUSTOMERS = ''
        else:
            IS_COMPLIANT = "N"
    except Exception as e:
        IS_COMPLIANT = "N"
        print(e)
        
    return [IS_COMPLIANT,ISSUE_DESCRIPTION,ROOT_CAUSE_CATEGORY,ROOT_CAUSE_SUB_CATEGORY,ROOT_CAUSE_ANALYSIS,BUSINESS_IMPACT,IMPACTED_APPLICATION,COMPONENT_NAME,NUMBER_OF_CUSTOMERS,ISSUE_IDENTIFIED,TEMP_FIX,PERM_FIX,PREVENTIVE_ACTIONS,NEW_SCOPE_ADDITION_FLAG]
    
def system_match(str0):# System Match
    ISSUE_DESCRIPTION = ''
    ROOT_CAUSE_CATEGORY = ''
    ROOT_CAUSE_SUB_CATEGORY = ''
    ROOT_CAUSE_ANALYSIS = ''
    BUSINESS_IMPACT = ''
    IMPACTED_APPLICATION = ''
    COMPONENT_NAME = ''
    RELEASE_RELATED = ''
    NUMBER_OF_CUSTOMERS = ''
    ISSUE_IDENTIFIED = ''
    TEMP_FIX = ''
    PERM_FIX = ''
    PREVENTIVE_ACTIONS = ''
    NEW_SCOPE_ADDITION_FLAG = ''

    myre = re.compile(system,re.IGNORECASE)
    str0 = re.sub(r"[\n\r\t\xa0]", "", str0)
    match_result = myre.search(str0)
    try:
        NOT_APPLICABLE = 'Not Applicable'
        if match_result is not None:
            IS_COMPLIANT = "Y"
            ISSUE_DESCRIPTION = match_result.group(5).strip()
            ROOT_CAUSE_CATEGORY = match_result.group(1)
            ROOT_CAUSE_SUB_CATEGORY = match_result.group(2)
            ROOT_CAUSE_ANALYSIS = match_result.group(3).strip()
            BUSINESS_IMPACT = NOT_APPLICABLE #match_result.group(5).strip()
            IMPACTED_APPLICATION = NOT_APPLICABLE #match_result.group(6).strip()
            COMPONENT_NAME = match_result.group(4).strip()
            RELEASE_RELATED = match_result.group(6).strip()[0]
            NUMBER_OF_CUSTOMERS = NOT_APPLICABLE #match_result.group(8).strip()
            ISSUE_IDENTIFIED = NOT_APPLICABLE  #match_result.group(9).strip()
            TEMP_FIX = match_result.group(7).strip()
            PERM_FIX = match_result.group(8).strip()
            PREVENTIVE_ACTIONS = NOT_APPLICABLE #match_result.group(12).strip()
            NEW_SCOPE_ADDITION_FLAG = match_result.group(9).strip()[0]
            if NEW_SCOPE_ADDITION_FLAG != 'N' and NEW_SCOPE_ADDITION_FLAG != 'Y':
                IS_COMPLIANT = "N"
        else:
            IS_COMPLIANT = "N"
    except Exception as e:
        IS_COMPLIANT = "N"
        print(e)
        
    return [IS_COMPLIANT,ISSUE_DESCRIPTION,ROOT_CAUSE_CATEGORY,ROOT_CAUSE_SUB_CATEGORY,ROOT_CAUSE_ANALYSIS,BUSINESS_IMPACT,IMPACTED_APPLICATION,COMPONENT_NAME,RELEASE_RELATED,NUMBER_OF_CUSTOMERS,ISSUE_IDENTIFIED,TEMP_FIX,PERM_FIX,PREVENTIVE_ACTIONS,NEW_SCOPE_ADDITION_FLAG]


def execute_update(cur, sql, parsed_data, row, final_list):
    cur.execute(sql, parsed_data)
    if parsed_data[0] == 'N':
        l = list(row)
        l.append(0)
        l.append("Not Matched")
        l.append("Matched")
        l.append("Matched")
        final_list.append(tuple(l))


def parse_resolution_data(row):
    resolution_text = ''.join(row[15].read()) if row[15] is not None else ''
    if row[11] == 'User':
        parsed_data = user_match(resolution_text)
    else:
        parsed_data = system_match(resolution_text)
    parsed_data.append(row[1])
    return parsed_data


def process_db_rows(data, cur, sql_user, sql_system):
    final_list = []

    for row in data:
        parsed_data = parse_resolution_data(row)
        sql = sql_user if row[11] == 'User' else sql_system
        execute_update(cur, sql, parsed_data, row, final_list)

    return final_list


def send_dq_emails(df):
    for resolver in df[df.MATCH_FLAG != 1].RESOLVED_BY_SOEID.unique():
        try:
            newdf = df[
                (df.MATCH_FLAG != 1) &
                (df.RESOLVED_BY_SOEID == resolver)
            ]

            resolver_name = df[
                df.RESOLVED_BY_SOEID == resolver
            ]['RESOLVED_BY'].iloc[0]

            on_off_site = df[
                df.RESOLVED_BY_SOEID == resolver
            ]['COUNTRY'].iloc[0]

            html = html_template(resolver_name, newdf)

            df.loc[
                (df.RESOLVED_BY_SOEID == resolver) &
                (df.MATCH_FLAG != 1),
                'Email_sent'
            ] = 'YES'

            send_email(
                html,
                resolver + '@citi.com',
                "Offsite" if on_off_site == "IN" else "OnSite"
            )

        except Exception as e:
            print("error", e)


def dq_check():
    data = db_connection()
    global conn
    cur = conn.cursor()

    print(len(data))

    sql_user = """
        update zrobot_inc_resolution_details
        set IS_COMPLIANT = :IS_COMPLIANT,
            ISSUE_DESCRIPTION = :ISSUE_DESCRIPTION,
            ROOT_CAUSE_CATEGORY = :ROOT_CAUSE_CATEGORY,
            ROOT_CAUSE_SUB_CATEGORY = :ROOT_CAUSE_SUB_CATEGORY,
            ROOT_CAUSE_ANALYSIS = :ROOT_CAUSE_ANALYSIS,
            BUSINESS_IMPACT = :BUSINESS_IMPACT,
            IMPACTED_APPLICATION = :IMPACTED_APPLICATION,
            COMPONENT_NAME = :COMPONENT_NAME,
            NUMBER_OF_CUSTOMERS = :NUMBER_OF_CUSTOMERS,
            ISSUE_IDENTIFIED = :ISSUE_IDENTIFIED,
            TEMP_FIX = :ISSUE_IDENTIFIED,
            PERM_FIX = :PERM_FIX,
            PREVENTIVE_ACTIONS = :PREVENTIVE_ACTIONS,
            NEW_SCOPE_ADDITION_FLAG = :NEW_SCOPE_ADDITION_FLAG,
            TEMPLATE_VALIDATED = 'Y',
            UPDATED_ON = systimestamp
        where INC = :INC
    """

    sql_system = """
        update zrobot_inc_resolution_details
        set IS_COMPLIANT = :IS_COMPLIANT,
            ISSUE_DESCRIPTION = :ISSUE_DESCRIPTION,
            ROOT_CAUSE_CATEGORY = :ROOT_CAUSE_CATEGORY,
            ROOT_CAUSE_SUB_CATEGORY = :ROOT_CAUSE_SUB_CATEGORY,
            ROOT_CAUSE_ANALYSIS = :ROOT_CAUSE_ANALYSIS,
            BUSINESS_IMPACT = :BUSINESS_IMPACT,
            IMPACTED_APPLICATION = :IMPACTED_APPLICATION,
            COMPONENT_NAME = :COMPONENT_NAME,
            RELEASE_RELATED = :RELEASE_RELATED,
            NUMBER_OF_CUSTOMERS = :NUMBER_OF_CUSTOMERS,
            ISSUE_IDENTIFIED = :ISSUE_IDENTIFIED,
            TEMP_FIX = :ISSUE_IDENTIFIED,
            PERM_FIX = :PERM_FIX,
            PREVENTIVE_ACTIONS = :PREVENTIVE_ACTIONS,
            NEW_SCOPE_ADDITION_FLAG = :NEW_SCOPE_ADDITION_FLAG,
            TEMPLATE_VALIDATED = 'Y',
            UPDATED_ON = systimestamp
        where INC = :INC
    """

    try:
        final_list = process_db_rows(
            data,
            cur,
            sql_user,
            sql_system
        )
        conn.commit()

    except cx_Oracle.Error as error:
        conn.rollback()
        final_list = []
        print(error)

    finally:
        cur.close()
        conn.close()

    DF_INC = pd.DataFrame(
        final_list,
        columns=[
            'TICKET_TYPE', 'TICKET_NO', 'TITLE', 'CSI_ID', 'RESOLVED_BY',
            'RESOLVED', 'ALERT_CATGORY', 'TICKET_STATE',
            'ALERT_CATGORY_DER', 'RESOLVED_BY_SOEID',
            'ASSIGNMENT_GROUP', 'TICKET_CATEGORY', 'OPENED',
            'OPENED_BY', 'CONTACT_SOEID', 'RESOLUTION_DESCRIPTION',
            'COUNTRY', 'MATCH_FLAG', 'TEMPLATE TAG',
            'ROOT CAUSE CATEGORY', 'ROOT CAUSE SUB CATEGORY'
        ]
    )

    send_dq_emails(DF_INC)

dq_check()