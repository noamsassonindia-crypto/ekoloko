<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" dir="ltr" lang="en-gb" xml:lang="en-gb">
<head>

<meta http-equiv="content-type" content="text/html; charset=UTF-8" />
<meta http-equiv="content-language" content="en-gb" />
<meta http-equiv="content-style-type" content="text/css" />
<meta http-equiv="imagetoolbar" content="no" />
<meta name="resource-type" content="document" />
<meta name="distribution" content="global" />
<meta name="copyright" content="2000, 2002, 2005, 2007 phpBB Group" />
<meta name="keywords" content="" />
<meta name="description" content="" />
<title>&#1488;&#1511;&#1493;&#1500;&#1493;&#1511;&#1493; &#1492;&#1508;&#1493;&#1512;&#1493;&#1501; &bull; Index page</title>

<link rel="stylesheet" href="./styles/subsilver2/theme/stylesheet.css" type="text/css" />

<script type="text/javascript">
// <![CDATA[

function popup(url, width, height, name)
{
	if (!name)
	{
		name = '_popup';
	}

	window.open(url.replace(/&amp;/g, '&'), name, 'height=' + height + ',resizable=yes,scrollbars=yes,width=' + width);
	return false;
}

function jumpto()
{
	var page = prompt('Enter the page number you wish to go to.:', '');
	var perpage = '';
	var base_url = '';

	if (page !== null && !isNaN(page) && page > 0)
	{
		document.location.href = base_url.replace(/&amp;/g, '&') + '&start=' + ((page - 1) * perpage);
	}
}

/**
* Find a member
*/
function find_username(url)
{
	popup(url, 760, 570, '_usersearch');
	return false;
}

/**
* Mark/unmark checklist
* id = ID of parent container, name = name prefix, state = state [true/false]
*/
function marklist(id, name, state)
{
	var parent = document.getElementById(id);
	if (!parent)
	{
		eval('parent = document.' + id);
	}

	if (!parent)
	{
		return;
	}

	var rb = parent.getElementsByTagName('input');
	
	for (var r = 0; r < rb.length; r++)
	{
		if (rb[r].name.substr(0, name.length) == name)
		{
			rb[r].checked = state;
		}
	}
}


// ]]>
</script>
</head>
<body class="ltr">

<a name="top"></a>

<div id="wrapheader">

	<div id="logodesc">
		<table width="100%" cellspacing="0">
		<tr>
			<td><a href="./index.php"><img src="./styles/subsilver2/imageset/site_logo.gif" width="170" height="94" alt="" title="" /></a></td>
			<td width="100%" align="center"><h1>&#1488;&#1511;&#1493;&#1500;&#1493;&#1511;&#1493; &#1492;&#1508;&#1493;&#1512;&#1493;&#1501;</h1><span class="gen">ekoloko</span></td>
		</tr>
		</table>
	</div>

	<div id="menubar">
		<table width="100%" cellspacing="0">
		<tr>
			<td class="genmed">
							</td>
			<td class="genmed" align="right">
				<a href="./faq.php"><img src="./styles/subsilver2/theme/images/icon_mini_faq.gif" width="12" height="13" alt="*" /> FAQ</a>
							</td>
		</tr>
		</table>
	</div>

	<div id="datebar">
		<table width="100%" cellspacing="0">
		<tr>
			<td class="gensmall">Last visit was: Sun Feb 01, 2009 12:03 pm</td>
			<td class="gensmall" align="right">It is currently Sun Feb 01, 2009 12:03 pm<br /></td>
		</tr>
		</table>
	</div>

</div>

<div id="wrapcentre">

	
	<br style="clear: both;" />

	<table class="tablebg" width="100%" cellspacing="1" cellpadding="0" style="margin-top: 5px;">
	<tr>
		<td class="row1">
			<p class="breadcrumbs"><a href="./index.php">Board index</a></p>
			<p class="datetime">All times are UTC </p>
		</td>
	</tr>
	</table>
	<br /><table class="tablebg" cellspacing="1" width="100%">
<tr>
	<td class="cat" colspan="5" align="right">&nbsp;</td>
</tr>
<tr>
	<th colspan="2">&nbsp;Forum&nbsp;</th>
	<th width="50">&nbsp;Topics&nbsp;</th>
	<th width="50">&nbsp;Posts&nbsp;</th>
	<th>&nbsp;Last post&nbsp;</th>
</tr>
		<tr>
			<td class="row1" width="50" align="center"><img src="./styles/subsilver2/imageset/forum_read.gif" width="46" height="25" alt="No new posts" title="No new posts" /></td>
			<td class="row1" width="100%">
								<a class="forumlink" href="./viewforum.php?f=3">@@@@@ אקולוקו הסיירת @@@@@</a>
				<p class="forumdesc"></p>
							</td>
			<td class="row2" align="center"><p class="topicdetails">2</p></td>
			<td class="row2" align="center"><p class="topicdetails">322</p></td>
			<td class="row2" align="center" nowrap="nowrap">
									<p class="topicdetails">Sun Feb 01, 2009 1:31 am</p>
					<p class="topicdetails">seoceo2008						<a href="./viewtopic.php?f=3&amp;p=329#p329"><img src="./styles/subsilver2/imageset/icon_topic_latest.gif" width="18" height="9" alt="View the latest post" title="View the latest post" /></a>
					</p>
							</td>
		</tr>
	</table>
<span class="gensmall"> | <a href="./memberlist.php?mode=leaders">The team</a></span><br />

<br clear="all" />

<table class="tablebg" width="100%" cellspacing="1" cellpadding="0" style="margin-top: 5px;">
	<tr>
		<td class="row1">
			<p class="breadcrumbs"><a href="./index.php">Board index</a></p>
			<p class="datetime">All times are UTC </p>
		</td>
	</tr>
	</table>	<br clear="all" />

	<table class="tablebg" width="100%" cellspacing="1">
	<tr>
		<td class="cat" colspan="2"><h4>Who is online</h4></td>
	</tr>
	<tr>
			<td class="row1" rowspan="2" align="center" valign="middle"><img src="./styles/subsilver2/theme/images/whosonline.gif" alt="Who is online" /></td>
			<td class="row1" width="100%"><span class="genmed">In total there are <strong>2</strong> users online :: 1 registered, 0 hidden and 1 guest (based on users active over the past 5 minutes)<br />Most users ever online was <strong>4</strong> on Tue Dec 16, 2008 3:35 pm<br /><br />Registered users: <span style="color: #9E8DA7;" class="username-coloured">Alexa [Bot]</span></span></td>
	</tr>
			<tr>
			<td class="row1"><b class="gensmall">Legend :: <a style="color:#AA0000" href="./memberlist.php?mode=group&amp;g=5">Administrators</a>, <a style="color:#00AA00" href="./memberlist.php?mode=group&amp;g=4">Global moderators</a></b></td>
		</tr>
		</table>
	<br clear="all" />

	<table class="tablebg" width="100%" cellspacing="1">
	<tr>
		<td class="cat" colspan="2"><h4>Birthdays</h4></td>
	</tr>
	<tr>
		<td class="row1" align="center" valign="middle"><img src="./styles/subsilver2/theme/images/whosonline.gif" alt="Birthdays" /></td>
		<td class="row1" width="100%"><p class="genmed">No birthdays today</p></td>
	</tr>
	</table>

<br clear="all" />

<table class="tablebg" width="100%" cellspacing="1">
<tr>
	<td class="cat" colspan="2"><h4>Statistics</h4></td>
</tr>
<tr>
	<td class="row1"><img src="./styles/subsilver2/theme/images/whosonline.gif" alt="Statistics" /></td>
	<td class="row1" width="100%" valign="middle"><p class="genmed">Total posts <strong>321</strong> | Total topics <strong>1</strong> | Total members <strong>96</strong> | Our newest member <strong>12345</strong></p></td>
</tr>
</table>


<br clear="all" />

<table class="legend">
<tr>
	<td width="20" align="center"><img src="./styles/subsilver2/imageset/forum_unread.gif" width="46" height="25" alt="New posts" title="New posts" /></td>
	<td><span class="gensmall">New posts</span></td>
	<td>&nbsp;&nbsp;</td>
	<td width="20" align="center"><img src="./styles/subsilver2/imageset/forum_read.gif" width="46" height="25" alt="No new posts" title="No new posts" /></td>
	<td><span class="gensmall">No new posts</span></td>
	<td>&nbsp;&nbsp;</td>
	<td width="20" align="center"><img src="./styles/subsilver2/imageset/forum_read_locked.gif" width="46" height="25" alt="No new posts [ Locked ]" title="No new posts [ Locked ]" /></td>
	<td><span class="gensmall">Forum locked</span></td>
</tr>
</table>

</div>

<!--
	We request you retain the full copyright notice below including the link to www.phpbb.com.
	This not only gives respect to the large amount of time given freely by the developers
	but also helps build interest, traffic and use of phpBB3. If you (honestly) cannot retain
	the full copyright we ask you at least leave in place the "Powered by phpBB" line, with
	"phpBB" linked to www.phpbb.com. If you refuse to include even this then support on our
	forums may be affected.

	The phpBB Group : 2006
//-->

<div id="wrapfooter">
		<span class="copyright">Powered by <a href="http://www.phpbb.com/">phpBB</a> &copy; 2000, 2002, 2005, 2007 phpBB Group
	</span>
</div>

</body>
</html>